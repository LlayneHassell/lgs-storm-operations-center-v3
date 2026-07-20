# LGS Emergency Operations Center — Storm Intelligence Update

This release builds on the working Executive Dashboard and adds a live Storm Intelligence briefing panel.

## Added
- Storm classification, advisory, maximum wind, pressure and movement when published by NHC
- Latest forecast time and forecast timeline
- Operational impact score and level
- Contracts, subcontractors and NOAA alerts in the operating picture
- States represented by contracts/subcontractors inside the cone
- Expandable impacted-contract and subcontractor lists
- Cache-busting stylesheet and script version 3.0

Upload the contents of this folder to the existing `lgs-storm-operations-center-v3` repository and replace the current files.


## Sprint 4: Intelligent Deployment Planner
Adds ranked staging-location recommendations using the selected NHC forecast point, cone position, nearby mapped subcontractors/contracts, and major-road access. Includes 50/100/150/200-mile resource radii, state filtering, map markers, and planning safeguards.
