# MedNexus — checkpoint va final uchun tayyorgarlik

Taqdimot: `docs/MedNexus_pitch.pptx` (15 slayd). Final formati: **3 daqiqa taqdimot + 2 daqiqa demo + 2 daqiqa savol-javob**.

## Checklist

### Ertalab (checkpoint 2 dan oldin)
- [ ] 14-slaydni to'ldirish: jamoa a'zolarining ismi, roli va tajribasi.
- [ ] GitHub: PR'ni `main`ga merge qilish. Havolani tayyorlab qo'yish: `github.com/Sanjarbek1024/MedNexus`.
- [ ] Demo muhitini ishga tushirib, ikkita brauzer oynasida oldindan kirib turish (`user@mednexus.uz` va `doctor@mednexus.uz`):
  ```powershell
  $env:DATA_DIR="data/pitch"; backend\.venv\Scripts\python scripts\dev.py
  ```
  `data/pitch` — taqdimot uchun toza demo baza (20 holat, KT yo'q). Eski terminalda ishlab turgan server bo'lsa, avval uni to'xtating: server kodni faqat ishga tushganda o'qiydi.
- [ ] Solishtirish demosi: `doctor@mednexus.uz` sifatida `samples/demo/4_dicom/02_kokrak_pnevmoniya_bugun.dcm` ni yuklang. U 6 oy oldingi DICOM tekshiruvi bilan bir bemorga bog'lanadi va "Solishtirish"da o'zgarishlar jadvali chiqadi.
- [ ] Internetni tekshirish (Groq API). Zaxira: telefon hotspot'i.
- [ ] `samples/demo/` papkasini ochiq tutish. Har bir rasm uchun simptom matni `README.txt` da bor.

### Checkpoint 2 (14:00–18:00): uchta mentor, har biri 10 daqiqa
- [ ] **Texnik mentor:**
  - 8–9-slaydlar va jonli demo.
  - Notebook (`notebooks/brain_mri_transformer.ipynb`): ochiq dataset, bemor bo'yicha split, Swin-T/ViT, kalibratsiya.
  - Testlar: `pytest` va Playwright.
- [ ] **Biznes mentor:** 10–12-slaydlar (TAM/SAM/SOM, raqobat, monetizatsiya va unit economics).
- [ ] **Soha mentori:** 3, 6 va 7-slaydlar (muammo №6, xavfsizlik standarti, qonunchilik), keyin o'qitish rejimi va Safety monitor'ni ko'rsatish.
- [ ] Mentorlar tavsiyalarini yozib olish: CP2 bali 60% vazn bilan hisoblanadi.

### Kechqurun (19:30–21:00): finalga tayyorgarlik
- [ ] 60–90 soniyalik demo video yozish (quyidagi ssenariy).
- [ ] 3 daqiqalik pitch'ni 3 marta vaqt bilan mashq qilish. Slaydlar: 1 → 3 → 4 → 6 → 12 → 13 → 15.
- [ ] Imkon bo'lsa, notebook'ni Colab GPU'da to'liq ishga tushirish (~30 daqiqa) va haqiqiy test natijasini 9-slaydga qo'shish.
- [ ] Imkon bo'lsa, bitta shifokor bilan 5 daqiqa gaplashib, iqtibos olish (soha mentori uchun eng kuchli dalil).

### Final kuni
- [ ] Demo'dan oldin ikkala akkauntga kirib turish, sahifalarni oldindan ochib qo'yish.
- [ ] **Groq limiti:** vision model daqiqasiga ~1 000 chiqish tokeni beradi. Jonli demoda bitta yangi tahlil qiling, qolganini tayyor holatlardan (#19 miya MRT, #20 pnevmoniya) ko'rsating.
- [ ] Internet bo'lmasa, 5-slayddagi skrinshotlar va video zaxira bo'ladi.

## 2 daqiqalik demo ssenariysi
1. **User (0:00–0:50):**
   - "Yangi tahlil"da ko'krak rentgeni kartasini tanlab, `samples/demo/1_.../02_pnevmoniya.jpg` rasmini va simptomlarni kiriting.
   - Natijani ko'rsating: xotirjam banner, taxminiy foizlar (≤ 90%), sabablar, hamkor shifoxona.
2. **Chat (0:50–1:10):** "Bu xavflimi?" deb so'rang. Javob sodda tilda, 103 haqida eslatma bilan keladi.
3. **Miya MRT (1:10–1:25):** tayyor #19 holatini oching: glioma 0,96, neyroxirurgiyaga yo'naltirish.
4. **Doctor (1:25–2:00):** shoshilinch holat navbat boshida turibdi. Holatni ochib Grad-CAM va 2/2 model kelishuvini ko'rsating, "Tasdiqlash" → PDF. Oxirida bitta jumla bilan audit zanjiri va o'qitish rejimini eslating.

## Hakamlar savollariga tayyor javoblar

**Texnik**
- *"Modelingiz aniqligi qancha?"*
  - Har bir raqamni manbasi bilan aytamiz:
    - miya ViT-B/16: 97,6% validatsiya aniqligi (model kartasi);
    - sinish datasetining maqolasi: YOLOv5 precision 0,917.
  - Ko'krak modellari yirik ochiq datasetlarda o'qitilgan (NIH, CheXpert, MIMIC-CXR, PadChest va boshqalar); ballar operating point bo'yicha kalibrlangan.
  - O'z namunalarimizdagi natijalar klinik validatsiya emas, uni pilotda 1 000 rasmda radiolog bilan tekshiramiz.
- *"Modelni o'zingiz o'qitdingizmi?"*
  - Hozir ochiq, litsenziyasi aniq modellarni plagin sifatida ishlatamiz.
  - O'qitish pipeline'i tayyor: notebook, figshare'dagi 3 064 MRT kesim, bemor bo'yicha split, Swin-T/ViT, kalibratsiya, ONNX.
  - Keyingi qadam: klinikalar bilan anonimlashtirilgan mahalliy dataset.
- *"Qaysi dataset, qancha aniqlik kutiladi?"*
  - Figshare "brain tumor dataset" (Jun Cheng): 3 064 T1-KM kesim, 233 bemor, 2 ta shifoxona (Xitoy, 2005–2010), CC BY 4.0. Sinflar: meningioma 708, glioma 1 426, gipofiz 930.
  - Asl maqola (Cheng va boshq., PLoS ONE, 2015) bemor bo'yicha 5-fold CV'da 91,28% olgan, lekin o'sma sohasi qo'lda belgilanishi kerak edi.
  - Bizning raqamimizni notebook'ni GPU'da to'liq ishga tushirgandan keyingina aytamiz.
- *"Nega Transformer?"*
  - Self-attention butun rasmdagi uzoq bog'lanishlarni ko'radi.
  - Katta ochiq datasetlarda oldindan o'qitilgan (transfer learning), kichik tibbiy datasetda yaxshi fine-tune bo'ladi.
  - Swin-T darchali attention bilan tezroq ishlaydi.
- *"LLM gallyutsinatsiya qilsa-chi?"*
  - Hisobot LLM'i rasmni ko'rmaydi, faqat model natijalarini oladi. Model topmagan topilma avtomatik o'chiriladi.
  - Vision modelning ehtimolliklari kodda 90% bilan cheklangan, jami 100% dan oshmaydi, "tashxis emas" belgisi qo'yiladi.
- *"Noto'g'ri rasm yuklansa-chi?"* Sifat, DICOM, anatomiya va OOD darvozalari rasmni rad etadi (masalan, mushuk surati yoki ko'krak deb yuklangan tizza).
- *"Ma'lumot xavfsizligi?"*
  - DICOM anonimlashtiriladi, bemor faqat PX-taxallus bilan ko'rinadi.
  - Argon2 va JWT cookie, CSRF, rollar, SHA-256 audit zanjiri.
  - Ochiq modellar mahalliy serverda ishlaydi.

**Biznes**
- *"Nega odamlar to'laydi?"*
  - Bugun ular vaqt bilan to'laydi: navbat va kunlab kutish.
  - Bizda 5 ta tahlil bepul, keyin tahlil uchun $1–2 (taksi narxidan arzon).
  - Qiymati: 1 daqiqada tushunarli javob va to'g'ri mutaxassis.
- *"Mijozni qanday jalb qilasiz?"* Hamkor klinikalar (ular bemor oladi), shifokor tavsiyasi, Telegram va mahalla poliklinikalari. Birinchi 10 klinika bilan o'zimiz shaxsan gaplashamiz.
- *"Unit economics?"*
  - Bir tahlilning AI xarajati < $0,01, narx esa $1–2, ya'ni yalpi marja > 95%.
  - Cheksiz tarif qo'ymaymiz, shuning uchun eng faol foydalanuvchi zararga aylanmaydi.
- *"OpenAI buni ertaga chiqarsa, sizda nima qoladi?"*
  - O'zbek tilidagi xavfsiz oqim va hamkor klinikalar tarmog'i.
  - Mahalliy serverda ishlash (qonun talabi).
  - Shifokor tasdiqlagan mahalliy ma'lumotlar va ta'lim moduli.
- *"Kim to'laydi?"* Foydalanuvchi bemor, qaror qiluvchi va to'lovchi ham bemor. B2B tomonda: klinika 3% komissiya, shifokor Pro obunasi.

**Soha**
- *"Bu tashxis qo'yish emasmi? Kim javobgar?"*
  - Yo'q. Har bir natija qoralama va taxmin; yakuniy qarorni shifokor qabul qiladi.
  - Har bir harakat audit zanjirida, AI va shifokor kelishuvi monitoringda kuzatiladi.
- *"Bemorni qo'rqitmaysizmi?"*
  - Prompt xotirjam, sodda tilda yozishni talab qiladi. Shoshilinchlik uch darajada: odatiy, yaqin kunlarda, bugun.
  - Xavfli belgilar aytilsa, 103 ga yo'naltiradi.
- *"Qonunchilik?"*
  - O'RQ-547 (shaxsiy ma'lumotlar, mahalliy saqlash) va PQ-358 (AI strategiyasi 2030).
  - Vazirlar Mahkamasining 2025-yil iyuldagi rentgen/KT AI ustuvor loyihasi.
  - Keyingi qadam: SSV bilan klinik sinov va tibbiy vosita sifatida ro'yxatdan o'tish.
- *"Muammo №6 ga qanday javob berasiz?"*
  - Xavfsizlik standartining 8 qoidasi ilovada ishlaydi.
  - Ta'lim moduli ham bor: ko'r o'qish trenajyori va "AI xato qilgan holatlar" to'plami.
