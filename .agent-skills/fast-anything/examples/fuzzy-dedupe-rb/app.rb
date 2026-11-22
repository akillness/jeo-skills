# frozen_string_literal: true

# Find near-duplicate customer names, the slow way.
#     ruby app.rb
require_relative "fuzzy"

FIRST = %w[Maria Giulia Sofia Luca Marco Matteo José Zoë Łukasz Aiko Chen Olga Ahmed Fatima Liam Emma Noah Ava Mateo Ingrid].freeze
LAST = %w[Rossi Russo Ferrari Esposito Bianchi García Müller Nowak Tanaka Wang Ivanova Haddad Smith Johnson Brown Silva Kowalski Novák Dubois Larsen].freeze

def make_names(count, seed = 7)
  rng = Random.new(seed)
  Array.new(count) do
    name = "#{FIRST.sample(random: rng)} #{LAST.sample(random: rng)}"
    if rng.rand < 0.35
      i = rng.rand(name.length)
      name = name[0, i] + "aeiourstln"[rng.rand(10)] + name[(i + 1)..]
    end
    name
  end
end

if __FILE__ == $0
  names = make_names(400)
  pairs = Fuzzy.find_duplicates(names)
  puts "#{names.length} names, #{pairs.length} likely duplicate pairs"
  pairs.reject { |i, j| names[i] == names[j] }.first(5).each { |i, j| puts "  #{names[i]} ~ #{names[j]}" }
end
