--!nonstrict
-- Payload: decode mesh and image payloads sent by rbx_assets.py (zstd, then base64).
-- EncodingService does both steps natively, so a 4,000-triangle mesh crosses the MCP bridge
-- in one call and a 1024 px map in a few chunks.
--
--   local data = Payload.fromStage("hat")   -- {mesh = {positions, uvs, tris, triUV}, images = {color = {buf, w, h}}}

local Payload = {}

function Payload.decode(b64: string): buffer
	local enc = game:GetService("EncodingService")
	local packed = enc:Base64Decode(buffer.fromstring(b64))
	return enc:DecompressBuffer(packed, Enum.CompressionAlgorithm.Zstd)
end

-- Layout written by rbx_assets.pack_mesh: u32 nv, nuv, nt; f32 positions; f32 uvs; u32 tris; u32 tri UVs.
-- Indices are 0-based on the wire and 1-based here.
function Payload.mesh(buf: buffer)
	local nv, nuv, nt = buffer.readu32(buf, 0), buffer.readu32(buf, 4), buffer.readu32(buf, 8)
	local o = 12
	local positions = table.create(nv)
	for i = 1, nv do
		positions[i] = Vector3.new(buffer.readf32(buf, o), buffer.readf32(buf, o + 4), buffer.readf32(buf, o + 8))
		o += 12
	end
	local uvs = table.create(nuv)
	for i = 1, nuv do
		uvs[i] = Vector2.new(buffer.readf32(buf, o), buffer.readf32(buf, o + 4))
		o += 8
	end
	local tris = table.create(nt)
	for i = 1, nt do
		tris[i] = { buffer.readu32(buf, o) + 1, buffer.readu32(buf, o + 4) + 1, buffer.readu32(buf, o + 8) + 1 }
		o += 12
	end
	local triUV = table.create(nt)
	for i = 1, nt do
		triUV[i] = { buffer.readu32(buf, o) + 1, buffer.readu32(buf, o + 4) + 1, buffer.readu32(buf, o + 8) + 1 }
		o += 12
	end
	return { positions = positions, uvs = uvs, tris = tris, triUV = triUV }
end

-- Reassemble what rbx_assets.stage() sent in chunks to _G.RbxAssetStage[key].
function Payload.fromStage(key: string)
	local all = (_G :: any).RbxAssetStage
	local stage = all and all[key]
	assert(stage, "nothing staged under " .. key)
	local out: any = { mesh = nil, images = {} }
	for name, part in stage do
		local buf = Payload.decode(table.concat(part.chunks))
		if name == "mesh" then
			out.mesh = Payload.mesh(buf)
		else
			out.images[name] = { buf = buf, w = part.w, h = part.h }
		end
	end
	return out
end

function Payload.clear(key: string)
	local all = (_G :: any).RbxAssetStage
	if all then
		all[key] = nil
	end
end

return Payload
