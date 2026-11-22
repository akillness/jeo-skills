# frozen_string_literal: true

# Shared value helpers for fast-anything's Ruby side, and the call recorder
# (preloaded with "ruby -r" when FAST_ANYTHING_RECORD_OUT is set). Not meant to be used by hand.
require "json"

module FastAnything
  class Unsupported < StandardError; end

  module_function

  def enc(v)
    case v
    when nil, true, false, Integer then v
    when Float then v.finite? ? v : { "$float" => v.to_s }
    when String
      s = v.encoding == Encoding::UTF_8 ? v : v.encode(Encoding::UTF_8)
      raise Unsupported, "binary String" unless s.valid_encoding?
      s
    when Array then v.map { |x| enc(x) }
    when Hash
      raise Unsupported, "Hash with non-String keys" unless v.keys.all?(String)
      { "$hash" => v.map { |k, x| [k, enc(x)] } }
    when Symbol then raise Unsupported, "Symbol"
    else raise Unsupported, v.class.name
    end
  rescue EncodingError
    raise Unsupported, "binary String"
  end

  def dec(v)
    case v
    when Array then v.map { |x| dec(x) }
    when Hash
      tag, x = v.first
      case tag
      when "$float" then { "NaN" => Float::NAN, "Infinity" => Float::INFINITY, "-Infinity" => -Float::INFINITY }.fetch(x)
      when "$hash" then x.to_h { |k, e| [k, dec(e)] }
      else raise "unknown tag #{tag}"
      end
    else v
    end
  end

  def same(a, b)
    if a.is_a?(Float) || b.is_a?(Float)
      return false unless a.is_a?(Float) && b.is_a?(Float)
      return a.nan? && b.nan? if a.nan? || b.nan?
      return a == b || (a - b).abs <= [1e-12, 1e-9 * [a.abs, b.abs].max].max
    end
    return a.length == b.length && a.zip(b).all? { |x, y| same(x, y) } if a.is_a?(Array) && b.is_a?(Array)
    return a.keys.sort == b.keys.sort && a.all? { |k, x| same(x, b[k]) } if a.is_a?(Hash) && b.is_a?(Hash)

    a.class == b.class && a == b
  end
end

if ENV["FAST_ANYTHING_RECORD_OUT"]
  module FastAnything
    @kept = []
    @calls = 0
    @skipped = 0
    @unsupported = {}
    @limit = Integer(ENV.fetch("FAST_ANYTHING_RECORD_LIMIT", "500"))
    @rng = Random.new(0xFA57)

    class << self
      attr_reader :kept

      def store(slot, c)
        if @kept.length < @limit then @kept << c else @kept[slot % @limit] = c end
      end

      def note(e)
        @skipped += 1
        @unsupported[e.message] = true
      end

      def record(original, receiver, args, blk)
        @calls += 1
        slot = @kept.length < @limit ? @kept.length : @rng.rand(@calls)
        c = nil
        if slot < @limit
          begin
            c = { "args" => enc(args) } # before the call, in case it mutates its arguments
          rescue Unsupported => e
            note(e)
          end
        end
        begin
          result = original.bind_call(receiver, *args, &blk)
        rescue StandardError => e
          if c
            c["raises"] = e.class.name
            store(slot, c)
          end
          raise
        end
        if c
          begin
            @mutates = true if enc(args) != c["args"]
          rescue Unsupported
            nil
          end
          begin
            c["result"] = enc(result)
            store(slot, c)
          rescue Unsupported => e
            note(e)
          end
        end
        result
      end

      def save
        File.write(ENV.fetch("FAST_ANYTHING_RECORD_OUT"), @kept.map { |c| JSON.generate(c) + "\n" }.join)
        File.write(ENV.fetch("FAST_ANYTHING_RECORD_META"),
                   JSON.generate({ "calls" => @calls, "kept" => @kept.length, "skipped" => @skipped, "unsupported" => @unsupported.keys, "mutates" => @mutates || false }))
      end
    end
  end

  $__fast_anything_wrap = lambda do |owner, name|
    original = owner.instance_method(name)
    was_private = owner.private_method_defined?(name)
    owner.send(:define_method, name) { |*args, &blk| FastAnything.record(original, self, args, blk) }
    owner.send(:private, name) if was_private
  end

  at_exit { FastAnything.save }
end
