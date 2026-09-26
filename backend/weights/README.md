# Model weights

All model weights live in this folder (`WEIGHTS_DIR`, default `backend/weights`), so the project
folder is self-contained: copy or upload it as a whole and the API starts without downloading.

| File | Model |
|---|---|
| `nih-pc-chex-mimic_ch-google-openi-kaggle-densenet121-…-best.pt` | DenseNet-121 chest X-ray (torchxrayvision) |
| `pc-nih-rsna-siim-vin-resnet50-test512-e400-state.pt` | ResNet-50 chest X-ray (torchxrayvision) |
| `pspnet_chestxray_best_model_4.pth` | PSPNet lung / heart segmentation |
| `nihpcrsnamimic_ch-resnet101-2-ae-test2-elastic-e250.pt` | ResNet autoencoder (out-of-distribution gate) |
| `yolov7-p6-bonefracture.onnx` | YOLOv7-p6 fracture detector |
| `brain-tumor-vit-b16.safetensors` | ViT-B/16 brain tumor classifier |

The files are too large for GitHub, so git ignores them. If this folder is empty, the API downloads
the missing files here on first start (about 1 GB).
