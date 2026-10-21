---
license: apache-2.0
tags:
  - skillsafe
  - browser
  - onnxruntime-web
  - background-removal
  - import
base_model: tomjackson2023/rembg
---

# U²-Net-p small background removal

Browser-ready `import` artifacts for **background-removal**, produced by SkillSafe's
reproducible converter ([`models/` in skillsafe.ai](https://github.com/skillsafe-admin/skillsafe.ai-website/tree/main/models))
from a pinned upstream source. Every byte here is derivable from that source plus
the recipe below; nothing was edited by hand.

## Provenance

| | |
|---|---|
| Upstream | https://huggingface.co/tomjackson2023/rembg/tree/cd3a3d6767a7859efea31ef0f2f373582cf06d82 |
| Upstream SHA-256 / commit | `cd3a3d6767a7859efea31ef0f2f373582cf06d82` |
| Recipe | `recipes/u2netp.yaml` — sha256 `207ffd0ebb549914179faa39602301d0c607504cd4270ce035acfd339e26532b` |
| Toolchain | Python 3.12.13, torch 2.10.0, onnx 1.23.0, onnxruntime 1.30.0 on Darwin 25.6.0 arm64 |
| Converted | 2026-09-22T21:39:24+00:00 |

## Files

| file | class | size | SHA-256 |
|---|---|---|---|
| `u2netp.onnx` | registry | 4.36 MB | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |

`registry` files are parameter files served from `models.skillsafe.ai` once vetted;
`bundle` files ship inside an app; `registry-shared` is a runtime library reused by
every model of the same architecture.

## Verification

Imported as published upstream (no conversion). Each file is pinned by SHA-256 to its source; every ONNX file passed `onnx.checker` and a CPU smoke run under onnxruntime with zero-filled inputs at the declared shapes:

| file | inputs | outputs | ms |
|---|---|---|---|
| `u2netp.onnx` | input.1[1, 3, 320, 320] | 1959[1, 1, 320, 320], 1960[1, 1, 320, 320], 1961[1, 1, 320, 320], 1962[1, 1, 320, 320], 1963[1, 1, 320, 320], 1964[1, 1, 320, 320], 1965[1, 1, 320, 320] | 104.1 |

## Use in the browser

```js
import * as ort from "onnxruntime-web";
const session = await ort.InferenceSession.create("https://huggingface.co/skillsafe-ai/u2netp/resolve/main/u2netp.onnx", { executionProviders: ["webgpu", "wasm"] });
```

**Contract (u2netp.onnx):** input `input.1` float32 `[1, 3, 320, 320]` → output `1959` float32 `[1, 1, 320, 320]`, `1960` float32 `[1, 1, 320, 320]`, `1961` float32 `['Sigmoid1961_dim_0', 'Sigmoid1961_dim_1', 'Sigmoid1961_dim_2', 'Sigmoid1961_dim_3']`, `1962` float32 `['Sigmoid1962_dim_0', 'Sigmoid1962_dim_1', 'Sigmoid1962_dim_2', 'Sigmoid1962_dim_3']`, `1963` float32 `['Sigmoid1963_dim_0', 'Sigmoid1963_dim_1', 'Sigmoid1963_dim_2', 'Sigmoid1963_dim_3']`, `1964` float32 `['Sigmoid1964_dim_0', 'Sigmoid1964_dim_1', 'Sigmoid1964_dim_2', 'Sigmoid1964_dim_3']`, `1965` float32 `['Sigmoid1965_dim_0', 'Sigmoid1965_dim_1', 'Sigmoid1965_dim_2', 'Sigmoid1965_dim_3']`. Opset 11.

## Licence and attribution

U²-Net-p: Xuebin Qin et al., Apache License 2.0 (https://github.com/xuebinqin/U-2-Net); ONNX as distributed by rembg (MIT).

Licence: **Apache-2.0** — notice: https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE. The conversion recipe and
this model card are part of the SkillSafe repository and carry its licence; the
weights remain under the upstream licence above.

The full `manifest.json` in this repo records the recipe, sources, toolchain
(including the `uv.lock` hash) and per-file verification numbers.
