# Notebooklar

## `brain_mri_transformer.ipynb` — miya MRT: o‘sma turini transformer bilan tasniflash

Ochiq datasetda ImageNet’da oldindan o‘qitilgan transformer’ni fine-tune qilish, halol baholash va MedNexus’ga eksport qilish — yuklab olishdan eksportgacha bitta notebookda.

- **Dataset:** figshare “brain tumor dataset” (Jun Cheng), DOI [10.6084/m9.figshare.1512427](https://doi.org/10.6084/m9.figshare.1512427), litsenziya **CC BY 4.0**, login shart emas. 3 064 ta T1 kontrastli (T1-CE) MRT slice, 233 bemor, 3 sinf: meningioma, glioma, gipofiz o‘smasi. Notebook uni o‘zi yuklab oladi (4 ta zip, ≈ 880 MB) va md5 summasini tekshiradi. `.mat` fayllar MATLAB v7.3 (HDF5) formatida, shuning uchun `h5py` bilan o‘qiladi.
- **Model:** Swin-T (`torchvision.models.swin_t`, ImageNet-1K og‘irliklari); `MODEL_NAME = "vit_b_16"` bilan ViT-B/16.
- **O‘qitish:** bemor darajasida 70/15/15 split (yoki mualliflarning `cvind.mat` 5-fold indekslari), 224 px, tibbiy jihatdan mos augmentation, AdamW + warmup + cosine, label smoothing, mixed precision, class weights, val macro-F1 bo‘yicha early stopping.
- **Baholash (test bemorlarida):** accuracy, macro-F1, sinflar bo‘yicha sensitivity/specificity, one-vs-rest ROC-AUC, confusion matrix, bemorlar bo‘yicha bootstrap 95 % CI; kalibrlash (reliability diagram, ECE, temperature scaling); Grad-CAM (ViT uchun attention rollout) va dataset’dagi o‘sma maskasi bilan solishtirish.
- **Eksport:** `model.safetensors`, `model.onnx`, `config.json` va `analyzers.yaml` uchun taklif qilingan yozuv.

### Ishga tushirish

Google Colab: faylni oching (*File → Upload notebook*, yoki `main` ga merge qilingandan keyin
<https://colab.research.google.com/github/Sanjarbek1024/MedNexus/blob/main/notebooks/brain_mri_transformer.ipynb>),
*Runtime → Change runtime type → T4 GPU*, keyin *Runtime → Run all*. Maqsadli vaqt T4’da taxminan 20–30 daqiqa (taxmin; har bir epoch vaqti chop etiladi). Colab’dagi paketlardan tashqari hech narsa kerak emas; eksport bo‘limi `onnx`/`onnxruntime` topilmasa ularni o‘rnatadi.

Asosiy sozlamalar birinchi kod katagida: `SMOKE_TEST`, `MODEL_NAME`, `EPOCHS`, `SPLIT_MODE`, `SEED`.

### Natijalar haqida

Notebookda ham, bu faylda ham oldindan yozilgan natija raqami yo‘q: barcha metrikalar notebook ishga tushirilganda hisoblanadi. Haqiqiy raqamlar faqat to‘liq GPU ishga tushirishdan (`SMOKE_TEST = False`) olinadi.

**Tekshiruv:** notebook `SMOKE_TEST = True` rejimida CPU’da (Windows, torch 2.14 CPU) kataklari ketma-ket skript sifatida bajarildi: figshare’ning faqat 1-zip qismi (766 slice) yuklandi, undan 17 bemorning 104 slice’i olindi, 1 epoch. Swin-T (`patient` va `cvind` split) va ViT-B/16 (`patient`) — barcha 19 kod katagi xatosiz ishladi: yuklab olish va md5, `.mat` o‘qish, bemor darajasida split, o‘qitish, metrikalar, kalibrlash, Grad-CAM/attention rollout, safetensors va ONNX eksport (onnxruntime bilan solishtirish), MedNexus preprocessing tekshiruvi. Eksport qilingan `model.safetensors` MedNexus’ning `read_safetensors` funksiyasi bilan yuklanishi ham tekshirildi. Smoke test natijalari ma’nosiz.

### Cheklovlar

figshare’da “no tumor” sinfi yo‘q — model normal miyani taniy olmaydi va har doim uchta o‘sma turidan birini tanlaydi. Ma’lumotlar bitta manbadan (ikki xitoy shifoxonasi, 2005–2010), faqat T1-CE, 2D slice’lar. Batafsil — notebookning 10-bo‘limida. Tadqiqot prototipi; tibbiy vosita emas.
