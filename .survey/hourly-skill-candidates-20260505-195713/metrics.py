#!/usr/bin/env python3
import json
d=json.load(open(".survey/hourly-skill-candidates-20260505-195713/evidence.json"))
print("lane	raw	kept	median_stars	status")

for lane,m in d["lanes"].items():
    print(f"{lane}	{m["raw_count"]}	{m["kept_count"]}	{m["median_stars_raw"]}	{m["lane_status"]}")
print("recommended_lane_count",d.get("recommended_lane_count"))
print("single_lane_concentration",d.get("single_lane_concentration"))