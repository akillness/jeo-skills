package main

import "strings"

// levenshtein is the edit distance: how many inserts, deletes or substitutions turn a into b.
func levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	if len(ra) < len(rb) {
		ra, rb = rb, ra
	}
	previous := make([]int, len(rb)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		current := make([]int, len(rb)+1)
		current[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			current[j] = min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
		}
		previous = current
	}
	return previous[len(rb)]
}

func normalize(name string) string {
	return strings.Join(strings.Fields(strings.ToLower(name)), " ")
}

// findDuplicates returns index pairs of names within maxDistance edits of each other.
func findDuplicates(names []string, maxDistance int) [][2]int {
	clean := make([]string, len(names))
	for i, n := range names {
		clean[i] = normalize(n)
	}
	var pairs [][2]int
	for i := range clean {
		for j := i + 1; j < len(clean); j++ {
			if levenshtein(clean[i], clean[j]) <= maxDistance {
				pairs = append(pairs, [2]int{i, j})
			}
		}
	}
	return pairs
}
