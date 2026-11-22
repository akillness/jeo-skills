// Find near-duplicate customer names, the slow way.
//
//	go run .
package main

import (
	"fmt"
	"math/rand"
)

var first = []string{"Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
	"Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"}
var last = []string{"Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka",
	"Wang", "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"}

func makeNames(count int, seed int64) []string {
	rng := rand.New(rand.NewSource(seed))
	names := make([]string, count)
	for k := range names {
		name := []rune(first[rng.Intn(len(first))] + " " + last[rng.Intn(len(last))])
		if rng.Float64() < 0.35 {
			name[rng.Intn(len(name))] = rune("aeiourstln"[rng.Intn(10)])
		}
		names[k] = string(name)
	}
	return names
}

func main() {
	names := makeNames(3000, 7)
	pairs := findDuplicates(names, 2)
	fmt.Printf("%d names, %d likely duplicate pairs\n", len(names), len(pairs))
	shown := 0
	for _, p := range pairs {
		if shown == 5 {
			break
		}
		if names[p[0]] != names[p[1]] {
			fmt.Printf("  %s ~ %s\n", names[p[0]], names[p[1]])
			shown++
		}
	}
}
