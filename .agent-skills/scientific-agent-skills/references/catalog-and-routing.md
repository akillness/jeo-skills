# Pinned Catalog and Routing

This reference is a compact inventory of the real upstream `skills/` tree at
release `v2.65.0`, commit
`f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f`. It records 163 names. Rebuild
the inventory from the selected checkout before routing against a newer pin.

At this pin, upstream `docs/skills.md` lists 162 names and omits
`waypoint-bio`; the real tree contains 163. This reference adds that missing
folder explicitly. The labels below are discovery aids, not endorsements,
license grants, or proof that a runtime is installed. Read the selected
`SKILL.md`, support files, license, scripts, dependencies, credentials,
network destinations, and data handling before use.

## Routing decision order

1. If the request is not explicitly about the K-Dense collection, prefer an
   existing local owner such as `academic-research`, `deep-research`,
   `research-paper-writing`, `paperbanana`, or
   `scientific-llm-benchmarks`.
2. Identify the exact scientific input, output, package or database, method, and
   execution surface.
3. Pick one primary upstream owner. Add a format or interoperability helper only
   when the data contract requires it.
4. Inspect license and risk boundaries before installation.
5. Do not select `docx`, `pdf`, `pptx`, or `xlsx`; route those to the
   existing local document skills.
6. Treat cloud, API, clinical, patient-data, and laboratory integrations as
   separate operations requiring explicit reviewed scope.

## Pinned inventory

### Scientific Databases & Data Access
- `database-lookup` - Database Lookup
- `depmap` - DepMap
- `imaging-data-commons` - Imaging Data Commons
- `primekg` - PrimeKG
- `ncats-arax` - NCATS ARAX
- `usfiscaldata` - U.S. Treasury Fiscal Data
- `ontology-term-resolution` - Ontology Term Resolution
- `pathogen-variant-surveillance` - Pathogen Variant Surveillance
- `hugging-science` - Hugging Science

### Scientific Integrations

#### Laboratory Information Management Systems (LIMS) & R&D Platforms
- `benchling-integration` - Benchling Integration

#### Cloud Platforms for Genomics & Biomedical Data
- `dnanexus-integration` - DNAnexus Integration

#### Laboratory Automation
- `opentrons-integration` - Opentrons Integration
- `ginkgo-cloud-lab` - Ginkgo Cloud Lab

#### Electronic Lab Notebooks (ELN)
- `labarchive-integration` - LabArchives Integration
- `open-notebook` - Open Notebook

#### Workflow Platforms & Cloud Execution
- `latchbio-integration` - LatchBio Integration
- `nextflow` - Nextflow
- `pacsomatic` - pacsomatic

#### Microscopy & Bio-image Data
- `omero-integration` - OMERO Integration

#### Protocol Management & Sharing
- `protocolsio-integration` - Protocols.io Integration

### Scientific Packages

#### Bioinformatics & Genomics
- `anndata` - AnnData
- `arboreto` - Arboreto
- `biopython` - BioPython
- `bioservices` - BioServices
- `bulk-rnaseq` - Bulk RNA-seq
- `cellxgene-census` - Cellxgene Census
- `deeptools` - deepTools
- `flowio` - FlowIO
- `gget` - gget
- `genomic-coordinates` - Genomic Coordinates
- `genomic-intelligence` - Genomic Intelligence
- `geniml` - geniml
- `gtars` - Gtars
- `onekgpd` - OneKGPd
- `polars-bio` - Polars-Bio
- `pysam` - pysam
- `pydeseq2` - PyDESeq2
- `pathway-enrichment` - Pathway Enrichment
- `scanpy` - Scanpy
- `scvelo` - scVelo
- `scvi-tools` - scvi-tools
- `scikit-bio` - scikit-bio
- `tiledbvcf` - TileDB-VCF
- `zarr-python` - Zarr
- `waypoint-bio` - Waypoint Bio (present in the skill tree but missing from docs/skills.md at this pin)

#### Data Management & Infrastructure
- `lamindb` - LaminDB
- `modal` - Modal
- `optimize-for-gpu` - Optimize for GPU

#### Cheminformatics & Drug Discovery
- `datamol` - Datamol
- `deepchem` - DeepChem
- `diffdock` - DiffDock
- `medchem` - MedChem
- `molfeat` - Molfeat
- `pytdc` - PyTDC
- `rdkit` - RDKit
- `rowan` - Rowan
- `torchdrug` - TorchDrug

#### Pharmacology & Pharmacometrics
- `pkpd-modeling` - PK/PD Modelling

#### Preclinical Research & Animal Welfare
- `relsa-severity-assessment` - RELSA Severity Assessment

#### Proteomics & Mass Spectrometry
- `matchms` - matchms
- `pyopenms` - pyOpenMS

#### Medical Imaging & Digital Pathology
- `deepspot-m` - DeepSpot-M
- `histolab` - histolab
- `pathml` - PathML
- `pydicom` - pydicom

#### Healthcare AI & Clinical Machine Learning
- `pyhealth` - PyHealth

#### Clinical Documentation & Decision Support
- `clinical-decision-support` - Clinical Decision Support
- `clinical-reports` - Clinical Reports
- `treatment-plans` - Treatment Plans

#### Neuroscience & Electrophysiology
- `bids` - BIDS
- `neurokit2` - NeuroKit2
- `neuropixels-analysis` - Neuropixels-Analysis

#### Protein Engineering & Design
- `adaptyv` - Adaptyv
- `esm` - ESM (Evolutionary Scale Modeling)
- `glycoengineering` - Glycoengineering
- `molecular-dynamics` - Molecular Dynamics
- `tamarind` - Tamarind

#### Machine Learning & Deep Learning
- `aeon` - aeon
- `cirq` - Cirq
- `pufferlib` - PufferLib
- `pymc` - PyMC
- `pymoo` - PyMOO
- `pytorch-lightning` - PyTorch Lightning
- `pennylane` - PennyLane
- `qiskit` - Qiskit
- `qutip` - QuTiP
- `scikit-learn` - scikit-learn
- `scikit-survival` - scikit-survival
- `shap` - SHAP
- `stable-baselines3` - Stable Baselines3
- `statsmodels` - statsmodels
- `timesfm-forecasting` - TimesFM Forecasting
- `torch-geometric` - Torch Geometric
- `transformers` - Transformers
- `umap-learn` - UMAP-learn

#### Materials Science & Chemistry
- `astropy` - Astropy
- `cobrapy` - COBRApy
- `pymatgen` - Pymatgen

#### Engineering & Simulation
- `lab-hardware-cad` - Lab Hardware CAD
- `matlab` - MATLAB/Octave
- `fluidsim` - FluidSim
- `openpiv` - OpenPIV
- `simpy` - SimPy
- `sympy` - SymPy

#### Data Analysis & Visualization
- `dask` - Dask
- `geomaster` - GeoMaster
- `geopandas` - GeoPandas
- `matplotlib` - Matplotlib
- `networkx` - NetworkX
- `polars` - Polars
- `seaborn` - Seaborn
- `uncertainty-and-units` - Uncertainty & Units
- `vaex` - Vaex

#### Phylogenetics & Evolutionary Biology
- `etetoolkit` - ETE Toolkit
- `phylogenetics` - Phylogenetics

#### Agent Frameworks
- `pi-agent` - Pi Agent

#### Autonomous Research & Optimization Frameworks
- `arbor` - Arbor

#### Scientific Communication & Publishing
- `bgpt-paper-search` - BGPT Paper Search
- `pyzotero` - pyzotero
- `citation-management` - Citation Management
- `generate-image` - Generate Image
- `infographics` - Infographics
- `latex-posters` - LaTeX Posters
- `market-research-reports` - Market Research Reports
- `pptx-posters` - PPTX Posters
- `scientific-schematics` - Scientific Schematics
- `scientific-slides` - Scientific Slides
- `venue-templates` - Venue Templates

#### Document Processing & Conversion
- `docx` - DOCX
- `markitdown` - MarkItDown
- `liteparse` - LiteParse
- `markdown-mermaid-writing` - Markdown & Mermaid Writing
- `pdf` - PDF
- `pptx` - PPTX
- `xlsx` - XLSX

#### Laboratory Automation & Equipment Control
- `pylabrobot` - PyLabRobot

#### Tool Discovery & Computational Resources
- `autoskill` - Autoskill
- `get-available-resources` - Get Available Resources

#### Research Methodology & Proposal Writing
- `paperclip` - Paperclip
- `paperzilla` - Paperzilla
- `paper-lookup` - Paper Lookup
- `research-grants` - Research Grants
- `research-lookup` - Research Lookup
- `scholar-evaluation` - Scholar Evaluation

#### Regulatory & Standards Evidence Preparation
- `iso-standards-readiness` - ISO Standards Readiness
- `analytical-method-validation` - Analytical Method Validation

### Scientific Thinking & Analysis

#### Analysis & Methodology
- `experimental-design` - Experimental Design
- `exploratory-data-analysis` - Exploratory Data Analysis
- `hypothesis-generation` - Hypothesis Generation
- `hypogenic` - HypoGeniC
- `literature-review` - Literature Review
- `peer-review` - Peer Review
- `scientific-brainstorming` - Scientific Brainstorming
- `scientific-critical-thinking` - Scientific Critical Thinking
- `scientific-visualization` - Scientific Visualization
- `scientific-writing` - Scientific Writing
- `statistical-analysis` - Statistical Analysis
- `statistical-power` - Statistical Power

#### Decision & Scenario Analysis
- `consciousness-council` - Consciousness Council
- `dhdna-profiler` - DHDNA Profiler
- `what-if-oracle` - What-If Oracle

#### Web Search & Information Retrieval
- `exa-search` - Exa Search
- `parallel-web` - Parallel Web

## High-impact selections

These names deserve extra review before operation:

- Credentials or paid/network services: `exa-search`, `parallel-web`,
  `modal`, `rowan`, `tamarind`, and named platform integrations.
- Cloud or institutional records: `benchling-integration`,
  `dnanexus-integration`, `latchbio-integration`,
  `labarchive-integration`, `omero-integration`, and
  `protocolsio-integration`.
- Physical laboratory control: `opentrons-integration`, `pylabrobot`, and
  cloud-lab integrations.
- Clinical or patient-facing interpretation: `clinical-decision-support`,
  `clinical-reports`, `treatment-plans`, `genomic-intelligence`, and
  related healthcare skills.
- Autonomous or long-running workflows: `autoskill`, `arbor`,
  `hypogenic`, and similar agent frameworks.

For these lanes, installing the instruction files is never approval to call a
service, spend money, upload data, control equipment, or issue a clinical
output.

## Source

- Upstream catalog at the pin: https://github.com/K-Dense-AI/scientific-agent-skills/blob/f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f/docs/skills.md
- Upstream tree at the pin: https://github.com/K-Dense-AI/scientific-agent-skills/tree/f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f/skills
