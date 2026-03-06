# skill: signalrisk-graph-intel-ui-ux
## Context & Purpose
SignalRisk Dashboard — Graph Intelligence sayfası için görsel ve kullanılabilirlik iyileştirme skill'i.
Bu sayfa; fraud ring'leri, paylaşılan cihazları ve merchant ağ ilişkilerini interaktif bir node-graph üzerinden analiz eden kritik bir araçtır.
Kullanıcılar fraud analistleri ve operasyon ekipleridir — hızlı karar vermeleri gerekir, bu yüzden görsel hiyerarşi ve veri netliği hayati önem taşır.
---
## Current Page Anatomy (Mevcut Durum Tespiti)
### Layout Bölgeleri
- **Sol Sidebar (220px):** Dark navy (#1a1f2e) zemin, logo + nav linkleri + versiyon
- **Top Header:** Admin badge, kullanıcı bilgisi, sign out
- **Main Content — Sol Panel (240px):** Fraud rings listesi, suspicious devices listesi, "how to use" açıklaması
- **Main Content — Merkez (büyük alan):** Dark navy graf canvas (node-graph görselleştirmesi)
- **Main Content — Sağ Panel (260px, slide-in):** Node Detail paneli (seçilen node bilgisi)
- **Stats Bar:** Total Nodes / Fraud Rings / Fraud Accounts / Suspicious Devices — 4 kart
### Mevcut Sorunlar (Pain Points)
1. **Zayıf görsel hiyerarşi:** Stats kartları düz, renksiz, sıradan beyaz kutular — önem duygusu taşımıyor
2. **Sol panel bilgi yoğunluğu:** "How to use" bölümü legend ile çakışıyor, alt kısımda gereksiz boşluk var
3. **Graf canvas boş hissettiriyor:** Koyu zemin iyi ama node sayısı az olduğunda alan çok büyük ve ıssız görünüyor
4. **Node Detail paneli zayıf:** Sadece ID ve iki badge gösteriyor, panelin büyük kısmı boş
5. **Renk tutarsızlıkları:** Fraud/risk metinleri için hem turuncu hem kırmızı kullanılıyor, alarm semantiği belirsiz
6. **Search bar görünmez:** Header'da kaybolmuş durumda, kontrast yok
7. **"How to use" bölümü:** Emoji + düz metin, profesyonel bir ürüne yakışmıyor
---
## Design Principles (Bu Sayfa İçin)
### 1. Dark-First Intelligence Aesthetic
Fraud analiz araçları için dark mode birincil tercih olmalı — göz yorgunluğunu azaltır, veri görselleştirmesi öne çıkar, profesyonel algı yaratır.