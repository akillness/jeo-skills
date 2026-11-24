package agent

import (
	"encoding/json"
	"fmt"
	"slices"
)

// factAssetAnchors accepts the historical asset_ids spelling and its explicit
// tested_asset_ids alias. Never union conflicting lists: that could attribute
// a conclusion to assets the caller did not actually check.
func (it factItem) factAssetAnchors() ([]int64, error) {
	assets, err := parseFactAssetIDs("asset_ids", it.AssetIDs)
	if err != nil {
		return nil, err
	}
	tested, err := parseFactAssetIDs("tested_asset_ids", it.TestedAssetIDs)
	if err != nil {
		return nil, err
	}
	if it.AssetIDs != nil && it.TestedAssetIDs != nil && !slices.Equal(assets, tested) {
		return nil, fmt.Errorf("asset_ids and tested_asset_ids must contain the same asset IDs when both are provided; use one field or correct the conflicting lists")
	}
	if it.TestedAssetIDs != nil {
		return tested, nil
	}
	return assets, nil
}

func parseFactAssetIDs(field string, raw []json.RawMessage) ([]int64, error) {
	ids := make([]int64, 0, len(raw))
	for i, value := range raw {
		id := pid(value)
		if id <= 0 {
			return nil, fmt.Errorf("%s[%d] must be a positive integer asset ID", field, i)
		}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return slices.Compact(ids), nil
}
