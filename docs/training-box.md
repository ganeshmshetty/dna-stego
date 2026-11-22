# Training box capacity check: `mycloud`

Measured 2026-11-22 on the existing instabox sandbox `mycloud` (template `omarchy`,
free plan, 4 vCPU / 8 GiB). Box was suspended; resumed cleanly with
`instabox resume mycloud`. This was a measurement exercise: nothing was installed
outside `/data/home/torchenv`, and no long-running processes were left behind.

## System

| Item | Value |
| --- | --- |
| OS | Omarchy (Arch-based), `ID=omarchy` |
| Kernel | `6.18.60-instabox-drm #1 SMP PREEMPT_DYNAMIC ... x86_64` |
| Python | 3.14.8 (system, `/usr/bin/python3`, GCC 16.2.1) |
| CPU / RAM | 4 vCPU, 7 GiB usable (8 GiB nominal) |
| Disk on `/data` | 20 G total, **8.9 G free** after installing torch (11 G free before) |
| Tooling present | `python3`, `docker`, `git`; no `pip3`, no `uv` |
| Torch | **2.15.0+cpu**, installed from `download.pytorch.org/whl/cpu` (`cp314` wheel) |

Torch installed without incident despite the very new Python. The `cp314` wheel
exists, so no workaround, alternate interpreter or AUR package was needed.

```text
torch-2.15.0+cpu-cp314-cp314-manylinux_2_28_x86_64.whl  209.5 MB
venv size: 956 MB   pip cache: 1.5 GB
```

The only warning is cosmetic: `Failed to initialize NumPy: No module named 'numpy'`
— numpy is absent from the venv, which does not affect torch compute. Install
`numpy` if the training code needs it for data loading.

## Benchmark

Synthetic CPU-only training loop, matching the requested shape:

- 3-layer 1D CNN: 4 -> 64 -> 128 -> 128 channels, kernel 5, padding 2, ReLU,
  global mean pool, linear head to 200x4 one-hot output.
- **227,680 parameters** (conv trunk ~124k + 200x4 output head ~102k).
- Input: one-hot DNA, 200 nt x 4 channels; batch 128; MSE loss; AdamW.
- 10 warmup steps, then 200 timed steps (forward + backward + optimizer step).
- `torch.set_num_threads(4)`.

| Threads | Steps/sec | Examples/sec | 200 steps |
| --- | --- | --- | --- |
| 1 | 6.57 | 841 | 30.4 s |
| 2 | 11.52 | 1,475 | 17.4 s |
| **4 (all vCPU)** | **21.12** | **2,704** | **9.47 s** |

Thread scaling is near-linear (~1.8x from 1->2, ~1.83x from 2->4), so the 4 vCPU
are real and usable rather than shared/throttled. The machine was otherwise idle
during measurement.

## Verdict

**Yes — this box is adequate to train a small conditional DNA generator (~1-5M
params) for a few hours, and it is the sensible place to do it.** Compute is the
strength: at 2,700 examples/sec for a 228k-param conv model, a realistic 1-5M
param generator should land in the rough range of 300-1,000 examples/sec
(3-8x slower per example), so a "few hours" budget buys on the order of 5-15M
example-steps. Concretely, a 1M-sequence dataset for 10 epochs (10M examples)
is about 3-10 hours depending on model width and sequence length, and a shorter
2-3 epoch run on 1-2M sequences fits comfortably in a 3-5 hour window. The two
caveats are memory and disk, not FLOPs: 8 GiB RAM caps batch size and dataloader
workers (keep the model and dataset small, stream data rather than materializing
a huge one-hot tensor — a 1M x 200 x 4 float32 one-hot corpus is ~3.2 GB in RAM),
and only ~8.9 GB of `/data` remains, which is fine for code, checkpoints and a
compressed corpus but not for a large pre-one-hot dataset. Keep `numpy` and any
tokenizer deps inside `/data/home/torchenv`, checkpoint to `/data`, and this box
can run the training job end to end; expect roughly 20-30 min per 1M examples at
the benchmark rate, scaling with model size.
