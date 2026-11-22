# frozen_string_literal: true

# Ruby side of fast-anything. The CLI copies this file to <project>/.fast/runner.rb and runs
#     ruby runner.rb <mode> <job.json> -- <the app's ruby arguments>
# Modes: profile, verify. Not meant to be run by hand.
require "json"
require "prism"
require_relative "recorder"

SKIP_DIRS = %w[.fast .git vendor node_modules].freeze
IO_CALLS = %i[puts print p pp gets printf putc open system exec spawn sleep warn require require_relative load exit abort fork trap].freeze
IO_RECEIVERS = %w[File IO Dir STDIN STDOUT STDERR $stdout $stderr $stdin Kernel Net::HTTP Socket TCPSocket Process FileUtils Open3].freeze
NONDET_CALLS = %i[rand srand].freeze
NONDET_RECEIVERS = %w[Random Time SecureRandom Date DateTime].freeze
GUARDS = ["__FILE__==$0", "$0==__FILE__", "__FILE__==$PROGRAM_NAME", "$PROGRAM_NAME==__FILE__"].freeze

def parse_target(argv)
  args = argv.dup
  while args.first&.start_with?("-")
    flag = args.shift
    args.shift if %w[-r -I -C].include?(flag)
  end
  abort "fast-anything: give the app as 'ruby script.rb ...'" if args.empty?
  [File.expand_path(args.shift), args]
end

def run_target(script, rest)
  $0 = script # so "if __FILE__ == $0" runs, as in a normal start
  ARGV.replace(rest)
  load script
rescue SystemExit => e
  raise unless e.success?
end

# ------------------------------------------------------------------ static analysis

def parsed(path)
  @parsed ||= {}
  return @parsed[path] if @parsed.key?(path)

  result = Prism.parse_file(path)
  defs = []
  guard = nil
  walk = lambda do |node, owner, in_def|
    node.compact_child_nodes.each do |child|
      case child
      when Prism::DefNode
        kind, own =
          if in_def then ["nested", nil]
          elsif child.receiver.is_a?(Prism::SelfNode) then owner ? ["singleton", "#{owner}.singleton_class"] : %w[object Object]
          elsif owner&.end_with?(".singleton_class") then ["singleton", owner]
          elsif owner.nil? then %w[object Object]
          else ["method", owner]
          end
        defs << { node: child, kind: kind, owner: own }
        walk.call(child, owner, true)
      when Prism::ModuleNode, Prism::ClassNode
        name = child.constant_path.slice
        walk.call(child, owner ? "#{owner}::#{name}" : name, in_def)
      when Prism::SingletonClassNode
        walk.call(child, owner ? "#{owner}.singleton_class" : "Object", in_def)
      when Prism::IfNode
        guard ||= child.location.start_line if owner.nil? && !in_def && GUARDS.include?(child.predicate.slice.delete(" "))
        walk.call(child, owner, in_def)
      else
        walk.call(child, owner, in_def)
      end
    end
  end
  walk.call(result.value, nil, false)
  @parsed[path] = { src: File.read(path, encoding: "UTF-8"), defs: defs, guard: guard }
rescue StandardError
  @parsed[path] = nil
end

def each_node(node, &block)
  return unless node

  yield node
  node.compact_child_nodes.each { |c| each_node(c, &block) }
end

def describe(path, line, name, entry, root)
  info = parsed(path) or return nil
  d = info[:defs]
      .select { |x| x[:node].name == name.to_sym && x[:node].location.start_line <= line && line <= x[:node].location.end_line }
      .min_by { |x| x[:node].location.end_line - x[:node].location.start_line }
  return nil unless d

  node = d[:node]
  blockers = []
  warnings = []
  factor = 0.9
  warnings << "no types in Ruby, types are inferred from recorded calls"
  rel = path.delete_prefix(root + "/")
  is_entry = entry && File.expand_path(entry) == File.expand_path(path)
  mod = is_entry ? "__main__" : rel.sub(/\.rb\z/, "").tr("/", ".")
  if is_entry && info[:guard].nil?
    blockers << "lives in the entry script, which runs on load: put that code under if __FILE__ == $0"
  elsif is_entry && node.location.start_line > info[:guard]
    blockers << "defined inside the if __FILE__ == $0 block"
  end
  blockers << "instance method (module functions and top-level methods only for now)" if d[:kind] == "method"
  blockers << "nested method" if d[:kind] == "nested"

  params = []
  if (ps = node.parameters)
    blockers << "takes keyword, block or splat arguments" if ps.keywords.any? || ps.keyword_rest || ps.block || ps.rest || ps.posts.any?
    ps.requireds.each { |r| params << { "name" => r.respond_to?(:name) ? r.name.to_s : r.slice, "annotation" => nil, "default" => nil } }
    ps.optionals.each { |o| params << { "name" => o.name.to_s, "annotation" => nil, "default" => o.value.slice } }
  end

  siblings = info[:defs].select { |x| x[:owner] == d[:owner] && x[:kind] != "nested" }.map { |x| x[:node].name }
  owner_base = d[:owner]&.delete_suffix(".singleton_class")
  io = []
  nondet = []
  helpers = []
  each_node(node.body) do |n|
    case n
    when Prism::CallNode
      recv = n.receiver&.slice
      io << n.name.to_s if recv.nil? && IO_CALLS.include?(n.name)
      io << "#{recv}.#{n.name}" if recv && IO_RECEIVERS.include?(recv)
      nondet << (recv ? "#{recv}.#{n.name}" : n.name.to_s) if (recv.nil? && NONDET_CALLS.include?(n.name)) || NONDET_RECEIVERS.include?(recv)
      local = recv.nil? || recv == "self" || recv == owner_base
      helpers << n.name.to_s if local && siblings.include?(n.name) && n.name != node.name
    when Prism::XStringNode, Prism::InterpolatedXStringNode then io << "backticks"
    when Prism::YieldNode then blockers << "yields to a block"
    when Prism::SuperNode, Prism::ForwardingSuperNode then blockers << "calls super"
    else
      kind = n.class.name.split("::").last
      blockers << "writes instance, class or global variables" if kind.match?(/\A(Instance|Class|Global)Variable.*Write/)
    end
  end
  blockers << "does I/O: #{io.uniq.first(3).join(", ")}" if io.any?
  blockers << "not deterministic: #{nondet.uniq.first(3).join(", ")}" if nondet.any?
  helpers.uniq!
  warnings << "calls #{helpers.first(3).join(", ")}, they get ported together with it" if helpers.any?
  blockers.uniq!

  lines = info[:src].lines
  {
    "qualname" => name.to_s, "module" => mod, "kind" => "function", "line" => node.location.start_line, "end_line" => node.location.end_line,
    "params" => params, "returns" => nil, "blockers" => blockers, "warnings" => warnings,
    "portability" => blockers.empty? ? factor : 0.0, "calls" => helpers, "owner" => d[:owner],
    "source" => lines[(node.location.start_line - 1)...node.location.end_line].join.rstrip,
  }
end

def project_relative(root, path)
  return nil unless path.start_with?(root + "/")

  rel = path.delete_prefix(root + "/")
  return nil if rel.split("/")[0...-1].any? { |p| SKIP_DIRS.include?(p) }

  rel
end

# ------------------------------------------------------------------ modes

def cmd_profile(job, argv)
  script, rest = parse_target(argv)
  root = File.expand_path(job["root"])
  stats = Hash.new { |h, k| h[k] = [0, 0.0, 0.0] } # calls, self, cumulative
  first_line = {}
  active = Hash.new(0)
  stack = []
  clock = Process::CLOCK_MONOTONIC
  tracer = TracePoint.new(:call, :return) do |t|
    path = t.path
    next unless path.start_with?(root)

    if t.event == :call
      key = [path, t.method_id]
      first_line[key] ||= t.lineno
      active[key] += 1
      stack << [key, Process.clock_gettime(clock), 0.0]
    elsif (frame = stack.pop)
      key, started, children = frame
      took = Process.clock_gettime(clock) - started
      s = stats[key]
      s[0] += 1
      s[1] += took - children
      active[key] -= 1
      s[2] += took if active[key].zero?
      stack.last[2] += took if stack.last
    end
  end
  started = Process.clock_gettime(clock)
  tracer.enable { run_target(script, rest) }
  wall = Process.clock_gettime(clock) - started

  rows = stats.filter_map do |(path, name), (calls, own, cum)|
    rel = project_relative(root, path) or next
    [path, rel, first_line[[path, name]], name, calls, own, cum]
  end
  functions = rows.sort_by { |r| -r[6] }.first(40).filter_map do |path, rel, line, name, calls, own, cum|
    info = describe(path, line, name, script, root) or next
    info.merge("file" => rel, "name" => name.to_s, "ncalls" => calls, "tottime" => own, "cumtime" => cum)
  end
  File.write(job["out"], JSON.generate({ "wall" => wall, "base" => ".", "functions" => functions }))
end

def bridge(path)
  require "fiddle"
  lib = Fiddle.dlopen(path)
  call = Fiddle::Function.new(lib["fa_call"], [Fiddle::TYPE_VOIDP, Fiddle::TYPE_SIZE_T, Fiddle::TYPE_VOIDP], Fiddle::TYPE_VOIDP)
  free = Fiddle::Function.new(lib["fa_free"], [Fiddle::TYPE_VOIDP, Fiddle::TYPE_SIZE_T], Fiddle::TYPE_VOID)
  lambda do |*args|
    input = JSON.generate(args)
    size = Fiddle::Pointer.malloc(Fiddle::SIZEOF_SIZE_T, Fiddle::RUBY_FREE)
    out = call.call(input, input.bytesize, size)
    len = size[0, Fiddle::SIZEOF_SIZE_T].unpack1("J")
    text = out[0, len].force_encoding(Encoding::UTF_8)
    free.call(out, len)
    reply = JSON.parse(text)
    raise reply["error"] if reply.key?("error")

    reply["ok"]
  end
end

SLICE_LENGTHS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55].freeze

def variants(value, rng)
  return [] unless (value.is_a?(Array) || value.is_a?(String)) && value.length >= 2

  SLICE_LENGTHS.select { |n| n < value.length }.flat_map do |n|
    Array.new(n < 2 ? 1 : 3) { value[rng.rand(value.length - n + 1), n] }
  end
end

NON_ASCII = ["\u{e9}", "\u{65e5}\u{672c}", "\u{1f44d}\u{1f3fd}", "e\u{301}"].freeze
BIG = 4096 # the longest "huge" input, in items or characters
EDGE_SAMPLE = 20
EDGE_LIMIT = 100
GROW = [4, 16, 64, 256, 512].freeze # how much bigger, step by step, than the short version of an input

# Inputs where ports and originals tend to part ways, of the same type as the recorded value.
def edges(value)
  case value
  when Integer then [0, 1, -1].reject { |x| x == value }
  when Float then [Float::NAN, Float::INFINITY, -Float::INFINITY, -0.0, 0.0, 1e308, 5e-324]
  when String
    mid = value.length / 2
    [value[0, mid] + NON_ASCII[0] + value[mid..], value + NON_ASCII[1], NON_ASCII[2] + value, value + NON_ASCII[3], ""]
  when Array
    return [] if value.empty?

    [[]] + edges(value[0]).first(4).map { |e| [e] + value[1..] }
  else []
  end
end

# A short version of a recorded value, so edge cases stay cheap when the real inputs are big.
def small(value)
  case value
  when Array then value.first(8)
  when String then value[0, 64]
  else value
  end
end

# The value repeated factor times (nil past BIG items or characters).
def bigger(value, factor)
  return nil unless (value.is_a?(Array) || value.is_a?(String)) && !value.empty? && value.length * factor <= BIG

  value * factor
end

# Edge cases from a sample of recorded calls: special numbers, non-ASCII text, empty and much bigger
# inputs. The original answers them; inputs it rejects are skipped.
def derive_edges(original, cases, budget, limit)
  derived = []
  seen = {}
  clock = Process::CLOCK_MONOTONIC
  started = Process.clock_gettime(clock)
  left = -> { budget - (Process.clock_gettime(clock) - started) }
  attempt = lambda do |args|
    encoded = { "args" => FastAnything.enc(args) }
    key = JSON.generate(encoded)
    return nil if seen[key]

    seen[key] = true
    t = Process.clock_gettime(clock)
    encoded["result"] = FastAnything.enc(original.call(*Marshal.load(Marshal.dump(args))))
    took = Process.clock_gettime(clock) - t
    encoded["derived"] = "edge"
    derived << encoded
    took
  rescue StandardError
    nil # outside the function's domain: not a fair test
  end
  grown = {}
  cases.reject { |c| c.key?("raises") }.first(EDGE_SAMPLE).each do |c|
    args = FastAnything.dec(c["args"])
    base = args.map { |a| small(a) }
    args.each_with_index do |arg, i|
      edges(base[i]).each do |e|
        return derived if derived.length >= limit || left.call <= 0

        attempt.call(base.each_with_index.map { |a, j| j == i ? e : a })
      end
      next if grown[i] || bigger(base[i], 4).nil?

      # much bigger inputs, only while their time (assumed quadratic) fits the budget
      grown[i] = true
      took = begin
        t = Process.clock_gettime(clock)
        original.call(*Marshal.load(Marshal.dump(base)))
        Process.clock_gettime(clock) - t
      rescue StandardError
        next
      end
      GROW.each do |factor|
        big = bigger(base[i], factor)
        break if big.nil? || derived.length >= limit || took * 16 > left.call / 2

        took = attempt.call(base.each_with_index.map { |a, j| j == i ? big : a })
        break if took.nil?
      end
    end
  end
  derived
end

def derive(original, cases, budget, limit)
  rng = Random.new(0xFA57)
  derived = derive_edges(original, cases, budget / 2.0, EDGE_LIMIT)
  limit += derived.length
  seen = {}
  started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  cases.each do |c|
    next if c.key?("raises")

    args = FastAnything.dec(c["args"])
    args.each_with_index do |arg, i|
      variants(arg, rng).each do |smaller|
        return derived if derived.length >= limit || Process.clock_gettime(Process::CLOCK_MONOTONIC) - started > budget

        next_args = args.dup
        next_args[i] = smaller
        begin
          encoded = { "args" => FastAnything.enc(next_args) }
          key = JSON.generate(encoded)
          next if seen[key]

          seen[key] = true
          encoded["result"] = FastAnything.enc(original.call(*Marshal.load(Marshal.dump(next_args))))
        rescue StandardError
          next # outside the function's domain: not a fair test
        end
        encoded["derived"] = true
        derived << encoded
      end
    end
  end
  derived
end

def best_pass(fn, calls, budget)
  best = Float::INFINITY
  spent = 0.0
  passes = 0
  while passes < 3 || (spent < budget && passes < 2000)
    t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    calls.each do |args|
      fn.call(*args)
    rescue StandardError
      nil
    end
    took = Process.clock_gettime(Process::CLOCK_MONOTONIC) - t
    best = [best, took].min
    spent += took
    passes += 1
  end
  best
end

def show(v, limit = 160)
  s = v.inspect
  s.length <= limit ? s : "#{s[0, limit - 1]}…"
end

def cmd_verify(job, _argv)
  ENV["FAST_ANYTHING_DISABLE"] = "1"
  fast = bridge(job["lib"])
  $0 = "fast-anything-verify" # the entry script's "if __FILE__ == $0" block must not run
  load job["module_file"]
  receiver = job["owner"] == "Object" ? Object.new : Object.const_get(job["owner"].delete_suffix(".singleton_class"))
  owner = job["owner"] == "Object" ? Object : receiver.singleton_class
  method = owner.instance_method(job["func"])
  original = ->(*args) { method.bind_call(receiver, *args) }

  cases = File.readlines(job["cases"], chomp: true).reject(&:empty?).map { |l| JSON.parse(l) }
  recorded = cases.length
  derived = derive(original, cases, job.fetch("derive_budget", 3.0), job.fetch("derive_limit", 200))
  cases += derived
  report = { "total" => cases.length, "derived" => derived.length, "edges" => derived.count { |c| c["derived"] == "edge" },
             "passed" => 0, "failed" => 0, "failures" => [] }
  calls = []
  cases.each_with_index do |c, i|
    args = FastAnything.dec(c["args"])
    calls << args
    err = nil
    begin
      got = fast.call(*args)
    rescue StandardError => e
      err = e
    end
    if c.key?("raises")
      ok = !err.nil?
      expected = "raises #{c["raises"]}"
    else
      want = FastAnything.dec(c["result"])
      ok = err.nil? && FastAnything.same(want, got)
      expected = show(want)
    end
    if ok
      report["passed"] += 1
      next
    end
    report["failed"] += 1
    next unless report["failures"].length < 8

    report["failures"] << {
      "case" => i,
      "call" => "#{{ "edge" => "(edge) ", true => "(derived) " }.fetch(c["derived"], "")}#{job["func"]}(#{args.map { |a| show(a, 80) }.join(", ")})",
      "expected" => expected,
      "got" => err ? "raised #{err.class}: #{show(err.message, 200)}" : show(got),
    }
  end
  if recorded.positive? && report["failed"].zero?
    calls = calls.first(recorded)
    rb = best_pass(original, calls, job.fetch("budget", 0.5))
    rs = best_pass(fast, calls, job.fetch("budget", 0.5))
    report["micro"] = { "original_ns" => rb / calls.length * 1e9, "rust_ns" => rs / calls.length * 1e9, "speedup" => rs.positive? ? rb / rs : 0 }
  end
  File.write(job["out"], JSON.generate(report))
end

mode, job_path, *rest = ARGV
rest.shift if rest.first == "--"
job = JSON.parse(File.read(job_path))
ARGV.clear
case mode
when "profile" then cmd_profile(job, rest)
when "verify" then cmd_verify(job, rest)
else abort "unknown mode #{mode}"
end
