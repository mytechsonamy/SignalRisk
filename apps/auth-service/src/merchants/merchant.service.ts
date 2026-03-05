import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MerchantRepository } from './merchant.repository';
import { Merchant } from './merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

function generateApiKey(): string {
  // Format: sk_test_ + 32 random hex chars
  const randomHex = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  return `sk_test_${randomHex}`;
}

type SafeMerchant = Omit<Merchant, 'apiKeyHash'>;

function omitHash(merchant: Merchant): SafeMerchant {
  const { apiKeyHash: _hash, ...safe } = merchant;
  return safe;
}

@Injectable()
export class MerchantService {
  constructor(private readonly merchantRepository: MerchantRepository) {}

  async createMerchant(dto: CreateMerchantDto): Promise<SafeMerchant & { apiKey: string }> {
    const apiKey = generateApiKey();
    const merchant = await this.merchantRepository.create(
      {
        name: dto.name,
        webhookUrl: dto.webhookUrl,
        rateLimitPerMinute: dto.rateLimitPerMinute,
        tier: dto.tier,
      },
      apiKey,
    );
    return { ...omitHash(merchant), apiKey };
  }

  async getMerchant(id: string): Promise<SafeMerchant> {
    const merchant = await this.merchantRepository.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    return omitHash(merchant);
  }

  async updateMerchant(id: string, dto: UpdateMerchantDto): Promise<SafeMerchant> {
    const merchant = await this.merchantRepository.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    const updated = await this.merchantRepository.update(id, {
      name: dto.name,
      webhookUrl: dto.webhookUrl,
      rateLimitPerMinute: dto.rateLimitPerMinute,
      tier: dto.tier,
      isActive: dto.isActive,
    });
    if (!updated) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    return omitHash(updated);
  }

  async deleteMerchant(id: string): Promise<void> {
    const merchant = await this.merchantRepository.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    await this.merchantRepository.softDelete(id);
  }

  async rotateApiKey(id: string): Promise<{ apiKey: string; prefix: string }> {
    const merchant = await this.merchantRepository.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    const apiKey = generateApiKey();
    const updated = await this.merchantRepository.rotateApiKey(id, apiKey);
    if (!updated) {
      throw new NotFoundException(`Merchant with id ${id} not found`);
    }
    return { apiKey, prefix: updated.apiKeyPrefix };
  }
}
