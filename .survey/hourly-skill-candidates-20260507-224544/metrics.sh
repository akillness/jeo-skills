#!/usr/bin/env bash
jq -r '.lanes | to_entries[] | "\(.key): raw=\(.value.raw_count) kept=\(.value.kept_count) status=\(.value.lane_status)"' ".survey/hourly-skill-candidates-20260507-224544/evidence.json"
