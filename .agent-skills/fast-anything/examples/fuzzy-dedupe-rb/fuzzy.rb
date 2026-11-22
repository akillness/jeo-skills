# frozen_string_literal: true

# Fuzzy string matching helpers.
module Fuzzy
  # Edit distance: how many inserts, deletes or substitutions turn a into b.
  def self.levenshtein(a, b)
    a, b = b, a if a.length < b.length
    previous = (0..b.length).to_a
    a.each_char.with_index(1) do |ca, i|
      current = [i]
      b.each_char.with_index(1) do |cb, j|
        current << [previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca == cb ? 0 : 1)].min
      end
      previous = current
    end
    previous.last
  end

  def self.normalize(name)
    name.downcase.split.join(" ")
  end

  # Index pairs of names within max_distance edits of each other.
  def self.find_duplicates(names, max_distance = 2)
    clean = names.map { |n| normalize(n) }
    pairs = []
    clean.each_index do |i|
      ((i + 1)...clean.length).each do |j|
        pairs << [i, j] if levenshtein(clean[i], clean[j]) <= max_distance
      end
    end
    pairs
  end
end
