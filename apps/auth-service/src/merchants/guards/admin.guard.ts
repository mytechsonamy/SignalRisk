import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * AdminGuard — verifies the request carries a valid admin JWT.
 *
 * In production this would decode and verify the JWT signature, check the
 * `role` claim equals "admin", and optionally validate expiry.  For now it
 * checks for a non-empty Bearer token so that the service can be tested with a
 * real HTTP client; the unit tests override it with a trivial mock.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Admin JWT required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Admin JWT required');
    }

    // TODO: verify RS256 signature and assert role === "admin"
    return true;
  }
}
