--!strict
-- AgentKit BufferCodec: fixed-schema binary encoding with the buffer library.
-- Runs in Studio (any data model), plain luau and Lune.
--
--   local Enemy = BufferCodec.schema({ {"id", "u16"}, {"hp", "f32"}, {"tint", "unorm8"}, {"pos", "vec3f32"} })
--   Enemy.size                      -- bytes per record when the schema has no strings, else nil
--   local b = Enemy:encode({ id = 7, hp = 92.5, tint = 0.5, pos = vector.create(1, 2, 3) })
--   local rec = Enemy:decode(b)     -- same fields back; floats come back at their stored precision
--   Enemy:encodeList(list), Enemy:decodeList(b)   -- u16 count, then the records
--
-- Types: u8 i8 u16 i16 u32 i32 f32 f64 bool (1 byte), unorm8 (0..1 float in 1 byte),
-- str8 (u8 length + bytes, at most 255 bytes), vec3f32 (12 bytes, decodes with vector.create).
-- Integer writes wrap silently in the buffer library (300 as u8 reads back 44), so encode
-- refuses out-of-range, fractional and non-finite values instead of corrupting the record.

local BufferCodec = {}

type Field = { name: string, kind: string }

local WIDTH: { [string]: number } = {
	u8 = 1, i8 = 1, u16 = 2, i16 = 2, u32 = 4, i32 = 4, f32 = 4, f64 = 8, bool = 1, unorm8 = 1, vec3f32 = 12,
}
local RANGE: { [string]: { number } } = {
	u8 = { 0, 255 }, i8 = { -128, 127 }, u16 = { 0, 65535 }, i16 = { -32768, 32767 },
	u32 = { 0, 4294967295 }, i32 = { -2147483648, 2147483647 },
}

local function finite(v: number): boolean
	return v == v and v ~= math.huge and v ~= -math.huge
end

local function checkInt(name: string, kind: string, v: any): number
	if type(v) ~= "number" or not finite(v) or v % 1 ~= 0 then
		error(`field {name}: {kind} needs an integer, got {tostring(v)}`, 3)
	end
	local r = RANGE[kind]
	if v < r[1] or v > r[2] then
		error(`field {name}: {v} is outside {kind} range {r[1]}..{r[2]}`, 3)
	end
	return v
end

local function writeField(b: buffer, o: number, f: Field, v: any): number
	local k = f.kind
	if RANGE[k] then
		local n = checkInt(f.name, k, v)
		if k == "u8" then buffer.writeu8(b, o, n)
		elseif k == "i8" then buffer.writei8(b, o, n)
		elseif k == "u16" then buffer.writeu16(b, o, n)
		elseif k == "i16" then buffer.writei16(b, o, n)
		elseif k == "u32" then buffer.writeu32(b, o, n)
		else buffer.writei32(b, o, n) end
		return o + WIDTH[k]
	elseif k == "f32" or k == "f64" then
		if type(v) ~= "number" or not finite(v) then
			error(`field {f.name}: {k} needs a finite number, got {tostring(v)}`, 2)
		end
		if k == "f32" then buffer.writef32(b, o, v) else buffer.writef64(b, o, v) end
		return o + WIDTH[k]
	elseif k == "bool" then
		buffer.writeu8(b, o, if v then 1 else 0)
		return o + 1
	elseif k == "unorm8" then
		if type(v) ~= "number" or not finite(v) then
			error(`field {f.name}: unorm8 needs a number in 0..1, got {tostring(v)}`, 2)
		end
		buffer.writeu8(b, o, math.round(math.clamp(v, 0, 1) * 255))
		return o + 1
	elseif k == "str8" then
		if type(v) ~= "string" or #v > 255 then
			error(`field {f.name}: str8 needs a string of at most 255 bytes`, 2)
		end
		buffer.writeu8(b, o, #v)
		buffer.writestring(b, o + 1, v)
		return o + 1 + #v
	elseif k == "vec3f32" then
		local x, y, z = v.X, v.Y, v.Z
		if not (finite(x) and finite(y) and finite(z)) then
			error(`field {f.name}: vec3f32 needs finite components`, 2)
		end
		buffer.writef32(b, o, x)
		buffer.writef32(b, o + 4, y)
		buffer.writef32(b, o + 8, z)
		return o + 12
	end
	error(`field {f.name}: unknown type {k}`, 2)
end

local function readField(b: buffer, o: number, f: Field): (any, number)
	local k = f.kind
	if k == "u8" then return buffer.readu8(b, o), o + 1
	elseif k == "i8" then return buffer.readi8(b, o), o + 1
	elseif k == "u16" then return buffer.readu16(b, o), o + 2
	elseif k == "i16" then return buffer.readi16(b, o), o + 2
	elseif k == "u32" then return buffer.readu32(b, o), o + 4
	elseif k == "i32" then return buffer.readi32(b, o), o + 4
	elseif k == "f32" then return buffer.readf32(b, o), o + 4
	elseif k == "f64" then return buffer.readf64(b, o), o + 8
	elseif k == "bool" then return buffer.readu8(b, o) ~= 0, o + 1
	elseif k == "unorm8" then return buffer.readu8(b, o) / 255, o + 1
	elseif k == "str8" then
		local n = buffer.readu8(b, o)
		return buffer.readstring(b, o + 1, n), o + 1 + n
	elseif k == "vec3f32" then
		return vector.create(buffer.readf32(b, o), buffer.readf32(b, o + 4), buffer.readf32(b, o + 8)), o + 12
	end
	error(`field {f.name}: unknown type {k}`)
end

local Codec = {}
Codec.__index = Codec

export type Codec = typeof(setmetatable({} :: { fields: { Field }, size: number? }, Codec))

function BufferCodec.schema(spec: { { string } }): Codec
	local fields: { Field } = {}
	local size: number? = 0
	for _, pair in spec do
		local name: string, kind: string = pair[1], pair[2]
		if kind ~= "str8" and not WIDTH[kind] then
			error(`unknown type {kind} for field {name}`, 2)
		end
		local field: Field = { name = name, kind = kind }
		table.insert(fields, field)
		if kind == "str8" then
			size = nil
		elseif size then
			size += WIDTH[kind]
		end
	end
	return setmetatable({ fields = fields, size = size }, Codec)
end

function Codec.sizeOf(self: Codec, rec: { [string]: any }): number
	if self.size then
		return self.size
	end
	local n = 0
	for _, f in self.fields do
		n += if f.kind == "str8" then 1 + #(rec[f.name] :: string) else WIDTH[f.kind]
	end
	return n
end

function Codec.write(self: Codec, b: buffer, o: number, rec: { [string]: any }): number
	for _, f in self.fields do
		o = writeField(b, o, f, rec[f.name])
	end
	return o
end

function Codec.read(self: Codec, b: buffer, o: number): ({ [string]: any }, number)
	local rec = {}
	for _, f in self.fields do
		rec[f.name], o = readField(b, o, f)
	end
	return rec, o
end

function Codec.encode(self: Codec, rec: { [string]: any }): buffer
	local b = buffer.create(self:sizeOf(rec))
	self:write(b, 0, rec)
	return b
end

function Codec.decode(self: Codec, b: buffer, offset: number?): { [string]: any }
	local rec = self:read(b, offset or 0)
	return rec
end

function Codec.encodeList(self: Codec, list: { { [string]: any } }): buffer
	checkInt("count", "u16", #list)
	local total = 2
	for _, rec in list do
		total += self:sizeOf(rec)
	end
	local b = buffer.create(total)
	buffer.writeu16(b, 0, #list)
	local o = 2
	for _, rec in list do
		o = self:write(b, o, rec)
	end
	return b
end

function Codec.decodeList(self: Codec, b: buffer): { { [string]: any } }
	local n = buffer.readu16(b, 0)
	local out: { { [string]: any } } = {}
	local o = 2
	for i = 1, n do
		out[i], o = self:read(b, o)
	end
	return out
end

return BufferCodec
