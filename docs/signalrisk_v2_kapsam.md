Aşağıdaki plan, ürünü “demo/prototype” seviyesinden “production-ready fraud platform” seviyesine taşımak için hazırlanmış tam kapsam + sprint planıdır. Mantık şu: önce kırık temel akışları ve güvenliği düzeltmek, sonra operasyonel güvenilirliği kurmak, en son ileri ürünleşme ve enterprise readiness’e geçmek.

Plan Çerçevesi

Süre: 12 sprint
Sprint süresi: 2 hafta
Toplam süre: yaklaşık 6 ay

Ana akış:

Platform stabilizasyonu
Security ve tenant isolation
Veri ve kontrat standardizasyonu
Operasyon ve gözlemlenebilirlik
Performans ve dayanıklılık
Ürün sertleştirme
Compliance ve go-live
Epic 1: Platform Reality Check ve Stabilizasyon

Amaç: doküman, kod, compose, topic, port, payload ve şema gerçekliğini tekleştirmek.

Kapsam:

Servis envanteri çıkarılması
Topic ve payload contract standardı
Port ve config standardı
README / TECHNICAL / compose hizalama
root test/build/lint scriptlerinin fail-fast yapılması
demo/mock bileşenlerin işaretlenmesi
Çıktı:

canonical architecture map
canonical event contract
canonical deployment matrix
Sprint 1

Tüm servislerin gerçek durum analizi
Topic, port, env, DB tablo envanteri
|| true kaldırılması
build/test/lint pipeline fail-fast hale getirilmesi
“çalışıyor / kısmi / mock / kırık” servis matrisi
Sprint 2

README, docs/TECHNICAL.md, compose ve runtime config hizalama
ortak naming convention tanımı
ortak event contract paketi tasarımı
kritik akışlar için mevcut test coverage boşluk analizi
Başarı kriteri:

Doküman ile runtime topolojisi birebir uyumlu
CI başarısızlıkları artık gizlenmiyor
Epic 2: Event-to-Decision Core Flow Hardening

Amaç: ingestion -> decision -> case/webhook zincirini gerçekten güvenilir hale getirmek.

Kapsam:

event schema validation
decision producer/consumer contract
case-service ve webhook-service entegrasyonu
idempotency davranışı
test traffic isolation
DLQ ve retry semantiği
Sprint 3

event-collector, decision-service, case-service, webhook-service arasında tek payload standardı
action/outcome alanlarının tekleştirilmesi
topic adlarının shared config’e alınması
decision event sürümleme stratejisi
Sprint 4

end-to-end integration testler
test traffic (is_test) davranışının tüm downstream servislerde tutarlı hale getirilmesi
webhook retry + DLQ akışının doğrulanması
case creation failure handling sertleştirmesi
Başarı kriteri:

BLOCK/REVIEW event’i case ve webhook zincirinde deterministik ilerliyor
integration testler bu zinciri uçtan uca doğruluyor
Epic 3: Auth, Identity ve Tenant Security

Amaç: demo auth’tan gerçek çok kiracılı güvenli auth modeline geçmek.

Kapsam:

in-memory merchant store kaldırılması
hardcoded kullanıcı/parola kaldırılması
JWT verification servis bazında zorunlu hale getirilmesi
RBAC
API key lifecycle
refresh token persistence
service-to-service auth
Sprint 5

merchant, user, api key tablolarının nihai modele oturtulması
dashboard login’in DB-backed hale getirilmesi
hardcoded login kullanıcılarının kaldırılması
password grant veya alternatif auth akışının netleştirilmesi
Sprint 6

tüm tenant-sensitive servislerde gerçek JWT imza doğrulaması
case-service tenant guard’ın sertleştirilmesi
API key create/rotate/revoke akışları
auth audit log başlangıcı
refresh token store’un DB-backed hale taşınması
Başarı kriteri:

forged token ile erişim mümkün değil
tenant spoofing negatif testleri yeşil
auth prod-ready minimum güvenlik seviyesine çıkmış durumda
Epic 4: Data Model, Persistence ve Schema Governance

Amaç: uygulama modeli ile DB modelinin kesin uyumlu olması.

Kapsam:

UUID standardı
migration temizliği
RLS testleri
is_test / retention / audit kolonlarının tutarlılığı
seed/dev/prod ayrımı
canonical schema ownership
Sprint 7

merchant_id, device_id, request_id kimlik modelinin tekleştirilmesi
decisions, cases, rules, webhooks, api_keys tablolarının revizyonu
migration zincirinin baştan sona test edilmesi
seed ve demo verilerin prod dışına alınması
Sprint 8

RLS policy testleri
repository katmanlarının schema ile hizalanması
soft delete / retention alanlarının standardize edilmesi
veri erişim pattern’lerinin dokümantasyonu
Başarı kriteri:

sıfırdan migration ile sistem ayağa kalkıyor
uygulama modeli ile SQL şeması çelişmiyor
RLS enforcement testlerle doğrulanıyor
Epic 5: Operasyonel Çalışabilirlik ve Deployment

Amaç: sistemin gerçek ortamda deploy edilebilir hale gelmesi.

Kapsam:

docker compose düzeltme
staging/prod config ayrımı
secret management
health/readiness doğruluğu
graceful shutdown
dependency startup ordering
Kubernetes manifest temizliği
Sprint 9

docker-compose dosyalarının repo gerçekliğine göre düzeltilmesi
dev/staging/prod env şablonları
config validation
secret handling standardı
health endpoint standardizasyonu
Sprint 10

k8s manifest review ve hizalama
deployment strategy: rolling / rollback
startup/readiness dependency kontrolü
runbook taslağı
staging ortamının ilk stabil kurulumu
Başarı kriteri:

local ve staging ayağa kaldırma prosedürü deterministic
servisler readiness olmadan trafik almıyor
rollback prosedürü tanımlı
Epic 6: Observability, SRE ve Incident Readiness

Amaç: sistem bozulduğunda hızlı teşhis edilebilmesi.

Kapsam:

structured logging
trace correlation
core metrics
alerting
dashboards
incident response runbook
Sprint 11

correlation/request ID standardı
log schema standardı
servis bazlı temel metrikler
Kafka lag, error rate, latency, webhook delivery başarı oranı
temel Grafana dashboard’ları
Sprint 12

alert tanımları
SLO/SLA dashboard’ları
incident runbook
synthetic smoke checks
staging game day / failure drill
Başarı kriteri:

incident olduğunda 5-10 dakikada teşhis mümkün
temel SLO metrikleri izleniyor
operasyon ekibi için runbook hazır
Epic 7: Performance, Resilience ve Capacity Engineering

Amaç: iddia edilen throughput ve latency hedeflerini ölçülebilir hale getirmek.

Kapsam:

load test
stress test
soak test
dependency degradation test
latency budget
connection pool tuning
backpressure tuning
Bu epic Sprint 9-12 ile paralel yürüyebilir.

Sprint 9-10 paralel işleri

load test harness kurulumu
temel traffic profilleri
steady-state throughput ölçümü
latency dağılımı çıkarımı
Sprint 11-12 paralel işleri

chaos/failure senaryoları
Kafka yavaşlığı, Redis kesintisi, PG bağlantı daralması
timeout ve circuit breaker tuning
backpressure threshold tuning
Başarı kriteri:

staging’de hedeflenen yükte p95/p99 ölçülmüş
dependency arızalarında sistem kontrollü degrade oluyor
backpressure davranışı güvenilir
Epic 8: Fraud Intelligence Productization

Amaç: core signal’ları işlevsel ama explainable ve yönetilebilir hale getirmek.

Kapsam:

signal weighting governance
rule management
explainability
analytics doğruluğu
fraud ops usability
feedback loop
Sprint 6-9 arası kademeli yürütülebilir.

İşler:

rule versioning
rule rollout / rollback
merchant bazlı threshold yönetimi
explainable decision payload
analytics veri doğruluğu
feedback loop’un gerçekten rule weight adjustment’a bağlanması
false positive / false negative analizi
Başarı kriteri:

fraud analyst neden BLOCK/REVIEW çıktığını görebiliyor
rule değişiklikleri güvenli rollout ile uygulanabiliyor
Epic 9: Dashboard ve Internal Ops UX Hardening

Amaç: dashboard’un gerçek operasyon aracı haline gelmesi.

Kapsam:

auth guard tamamlama
role-based page access
case workflow iyileştirme
live feed stabilizasyonu
graph view doğruluğu
audit trail görünürlüğü
Sprint 8-10 arası yürütülebilir.

İşler:

admin / analyst / viewer yetki matrisi
case assignment / resolution akışı
SLA breach görünürlüğü
real-time dashboard performans iyileştirmeleri
audit log ekranları
onboarding ve merchant config ekranları
Başarı kriteri:

dashboard demo aracı değil, operasyon aracı haline gelir
Epic 10: FraudTester Isolation ve Validation Platform

Amaç: FraudTester’ı faydalı ama core prod akışından ayrık bir araç haline getirmek.

Kapsam:

prod isolation
scenario governance
battle arena metrics doğruluğu
synthetic fraud benchmarking
test traffic contamination prevention
Sprint 10-11

FraudTester’ın env ve traffic ayrımı
test namespace / test merchant izolasyonu
senaryo çıktılarının analytics’ten dışlanması
benchmark rapor formatı
CI/staging regression senaryoları
Başarı kriteri:

FraudTester prod verisini kirletmiyor
test sonuçları güvenilir benchmark olarak kullanılabiliyor
Epic 11: Compliance, Privacy ve Security Assurance

Amaç: müşteri güvenlik incelemesinden geçebilecek seviyeye gelmek.

Kapsam:

KVKK/GDPR veri envanteri
PII data classification
retention / erase / export
audit logs
secrets scanning
dependency scanning
SBOM
pen-test hazırlığı
Sprint 11

veri envanteri
PII classification
retention ve erase süreçleri
export akışlarının doğrulanması
Sprint 12

SAST/dependency scan entegrasyonu
secret scan
SBOM üretimi
pen-test checklist
security questionnaire cevap seti
Başarı kriteri:

veri saklama ve silme davranışı net
güvenlik kontrolleri pipeline’a bağlı
enterprise procurement soru listelerine cevap hazırlanmış
Epic 12: Go-To-Production Enablement

Amaç: pilot müşteri veya ilk canlı merchant onboarding için hazır hale gelmek.

Kapsam:

onboarding flow
support playbook
rollout plan
rollback plan
pilot environment
commercial readiness destekleri
Sprint 12

pilot merchant onboarding runbook
support escalation flow
release checklist
rollback checklist
first customer success dashboard
acceptance signoff
Başarı kriteri:

ilk pilot canlıya kontrollü şekilde alınabilir
12 Sprint Özet Tablosu

Sprint 1

Mevcut durum analizi
Servis/topic/port/env matrisi
fail-fast CI
Sprint 2

Doküman/runtime hizalama
canonical contract ve naming
Sprint 3

Event/decision payload standardizasyonu
core topic standardizasyonu
Sprint 4

end-to-end integration testler
case/webhook zinciri hardening
Sprint 5

gerçek auth veri modeli
dashboard login refactor
Sprint 6

JWT verification ve tenant security
API key lifecycle
Sprint 7

DB schema cleanup
UUID ve persistence uyumu
Sprint 8

RLS testleri
dashboard ops hardening başlangıcı
Sprint 9

docker/config/deployment cleanup
load test harness
Sprint 10

staging stabilization
k8s/deploy/runbook
FraudTester isolation
Sprint 11

observability/alerts/SLO
privacy/compliance başlangıcı
resilience tuning
Sprint 12

security assurance
pilot go-live hazırlığı
operational signoff
Her Sprint İçin Zorunlu Definition of Done

Kod merge edilmeden önce unit + integration test yeşil
Doküman değişikliği varsa teknik doküman güncel
Yeni env var varsa config reference güncel
Yeni topic/payload varsa shared contract güncel
Monitoring impact varsa metric/log eklenmiş
Security impact varsa threat note eklenmiş
Demo/mock kod prod path’inde bırakılmamış
Öncelikli Backlog Başlıkları

P0

webhook consumer/prod contract fix
topic mismatch fix
auth hardcoded credential removal
tenant guard signature verification
UUID/schema alignment
CI fail-fast
P1

DB-backed merchant/user/api key
RLS test suite
e2e decision chain
docker-compose cleanup
metrics and alerting baseline
P2

rule governance
dashboard RBAC hardening
FraudTester isolation
compliance automation
load/chaos suite
Release Milestone’ları

Milestone A: Core Platform Reliable
Tarih: Sprint 4 sonu

core fraud zinciri güvenilir
doküman/runtime uyumlu
integration test var
Milestone B: Secure Multi-Tenant Beta
Tarih: Sprint 8 sonu

auth ve tenant isolation gerçek
DB modeli oturmuş
dashboard operasyona yaklaşmış
Milestone C: Staging Production Candidate
Tarih: Sprint 10 sonu

deploy edilebilir
staging stabil
runbook mevcut
Milestone D: Pilot Production Ready
Tarih: Sprint 12 sonu

observability, compliance, security baseline tamam
pilot merchant onboarding mümkün
Riskler

Kapsam fazla geniş; aynı anda tüm servisleri eşit olgunlaştırmaya çalışmak hızı öldürür.
Fraud intelligence tarafına erken özellik eklemek, güvenlik ve veri katmanı borcunu büyütür.
Dokümanlarla ürün hikayesi güçlü olduğu için “çalışıyor sanma” riski yüksek.
Multi-tenant ve auth katmanı çözülmeden pilot müşteri almak tehlikeli.
Önerim

Bu planı üç yönetim katmanında takip edelim:

Epics
Sprint backlog
Haftalık exit criteria