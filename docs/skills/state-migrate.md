# /state-migrate

Stateful fraud tablolarinin migration durumunu kontrol eder.

## Kullanim

```
/state-migrate [check|plan|status]
```

## Modlar

### check
- Hangi migration dosyalari mevcut? (007_entity_profiles.sql vb.)
- `schema_migrations` tablosunda hangileri uygulanmis?
- Bekleyen migration var mi?

### plan
- Sonraki sprint icin gerekli migration'lari listele
- RLS policy kontrolu: yeni tablolarda `merchant_id` + RLS var mi?
- Index kontrolu: gerekli index'ler tanimli mi?

### status
- Tablo varligi: `entity_profiles`, `decision_feature_snapshots`, `analyst_labels`, `watchlist_entries`
- RLS policy aktif mi?
- Row count per table (genel saglik)

## Cikti

Migration durumu + eksik tablo/policy listesi

## Kaynak

- `database/migrations/`
- `infrastructure/docker/initdb.d/`
- `docs/claude/source-of-truth.md`
