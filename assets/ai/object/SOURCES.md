# General object background removal

Model: U²-NetP (Apache-2.0), original authors Xuebin Qin et al.
Paper: https://arxiv.org/abs/2005.09007
Upstream: https://github.com/xuebinqin/U-2-Net
ONNX mirror: https://huggingface.co/skillsafe-ai/u2netp/tree/33f0c8b5c2429bcf0cfd62bbf48669eeec80c2a2
SHA-256 u2netp.onnx: 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8

Runtime: ONNX Runtime Web 1.22.0, MIT, loaded from jsDelivr only when requested.
https://github.com/microsoft/onnxruntime/tree/v1.22.0

The model detects salient foreground objects. It is distinct from the human
segmentation model. Busy backgrounds and objects of similar contrast may need
threshold refinement. Images and video frames are processed on the device.
A single WASM worker and bounded caches limit memory use on Android.
