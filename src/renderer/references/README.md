# Renderer References

**Bu klasördeki dosyalar aktif kod DEĞİLDİR.** `tsconfig.json`'da compile'dan hariç tutulurlar.

StoreKit v0.1 zamanında 12 sabit template içeriyordu. v0.2'den itibaren dinamik AI-template sistemine geçildi: `src/tools/mockup.ts` içindeki `analyzeScreenshot` → design brief → Claude custom HTML yazar → `renderHTML` Puppeteer ile PNG üretir akışı kullanılır.

Bu klasördeki dosyalar sadece **ilham kaynağı** olarak tutuluyor. Claude Code bir uygulamanın mockup'ını tasarlarken "bana bir finans/fitness/e-ticaret app'i için örnek HTML göster" derse bu dosyalardan ilham alabilir, ancak doğrudan çalıştırılmaz.

## İçerik

- `presets.reference.ts` — 12 template preset tanımı (aurora-gradient, midnight-glass, zen-minimal, bold-showcase, candy-pop, noir-elegance, neon-glow, frost-blur, organic-wave, editorial-stack, panoramic-hero, duo-showcase)
- `templates.reference.ts` — Her preset için HTML render fonksiyonları (device frame stilleri, efektler)
- `template-registry.reference.ts` — Tip tanımları ve eski kategori-bazlı recommendation engine

## Neden kaldırılmadı

1. Claude bazen "bu kategori için minimal bir örnek göster" diye kod okuyup stil örneği alabilir
2. Topluluk katkıları ile zamanla yeni hazır template'ler buraya eklenebilir
3. Offline fallback: sampling başarısız olursa rastgele bir preset kullanılabilir (henüz implement edilmedi)

## Kullanım

Aktif kodda bu dosyalardan import YOK. Hiçbir yerden referans verilmemeli. Sadece okuma için.
