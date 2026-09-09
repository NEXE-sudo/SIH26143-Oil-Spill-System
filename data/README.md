# Data

Never commit large raw datasets to this repository.

```
data/
├── samples/     # small, checked-in fixtures used for demos and tests
│   ├── sar/     # one or two sample Sentinel-1 scenes/crops
│   ├── masks/   # corresponding ground-truth or model-output masks
│   └── ais/     # a short sample AIS extract for the demo investigation
├── raw/         # gitignored — full downloaded scenes/AIS dumps go here
└── processed/   # gitignored — preprocessed/derived data goes here
```

`raw/` and `processed/` are gitignored except for `.gitkeep`; only
`samples/` is meant to be committed, and only with small files.

## Dataset log

Document every dataset used, here or in a linked `docs/datasets.md`:

```
Dataset source:
Download URL:
Version:
Licence:
Checksum:
Preprocessing applied:
```

### Sentinel-1 (SAR)

- Source:
- Download URL:
- Version:
- Licence:
- Checksum:
- Preprocessing:

### AIS

- Source:
- Download URL:
- Version:
- Licence:
- Checksum:
- Preprocessing:
