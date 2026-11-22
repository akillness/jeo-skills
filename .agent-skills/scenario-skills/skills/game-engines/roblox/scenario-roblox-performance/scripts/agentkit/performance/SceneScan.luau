--!nonstrict
-- SceneScan: the Scene Analysis tool's data (Window > Performance Summary > Scene Analysis) read by code
-- through SceneAnalysisService. Every query returns a tree of {Name, Size or Sizes, Children}.
--
--   SceneScan.all(top)        every query, each flattened to its top leaves
--   SceneScan.flatten(tree, top)   pure: leaves sorted by size, with their parent path (runs in Lune)
--   SceneScan.query(name)     one raw tree: "InstanceComposition", "ScriptMemory", "UnparentedInstances",
--                             "TriangleComposition", "AnimationMemory", "AudioMemory"

local SceneScan = {}

local QUERIES = {
	InstanceComposition = "GetInstanceCompositionAsync",
	ScriptMemory = "GetScriptMemoryAsync",
	UnparentedInstances = "GetUnparentedInstancesAsync",
	TriangleComposition = "GetTriangleCompositionAsync",
	AnimationMemory = "GetAnimationMemoryAsync",
	AudioMemory = "GetAudioMemoryAsync",
}

local function size(node)
	if type(node.Size) == "number" then
		return node.Size
	end
	-- TriangleComposition uses Sizes = {Triangles, Drawcalls}
	if type(node.Sizes) == "table" then
		return node.Sizes.Triangles or node.Sizes.Drawcalls or 0
	end
	return 0
end

function SceneScan.flatten(tree, top)
	top = top or 10
	local leaves = {}
	local function walk(node, path)
		local kids = node.Children
		if type(kids) ~= "table" or #kids == 0 then
			table.insert(leaves, { path = path, size = size(node), sizes = node.Sizes })
			return
		end
		for _, kid in kids do
			walk(kid, if path == "" then tostring(kid.Name) else path .. " / " .. tostring(kid.Name))
		end
	end
	for _, kid in tree.Children or {} do
		walk(kid, tostring(kid.Name))
	end
	table.sort(leaves, function(a, b)
		return a.size > b.size
	end)
	local out = {}
	for i = 1, math.min(top, #leaves) do
		out[i] = leaves[i]
	end
	local groups = {}
	for _, kid in tree.Children or {} do
		table.insert(groups, { name = kid.Name, size = size(kid), sizes = kid.Sizes })
	end
	table.sort(groups, function(a, b)
		return a.size > b.size
	end)
	return { name = tree.Name, total = size(tree), sizes = tree.Sizes, groups = groups, top = out, leaves = #leaves }
end

function SceneScan.query(name)
	local method = QUERIES[name]
	assert(method, "unknown query " .. tostring(name))
	local SAS = game:GetService("SceneAnalysisService")
	return SAS[method](SAS)
end

function SceneScan.all(top)
	local out = {}
	for name in QUERIES do
		local ok, tree = pcall(SceneScan.query, name)
		if ok and type(tree) == "table" then
			out[name] = SceneScan.flatten(tree, top or 8)
		else
			out[name] = { error = tostring(tree) }
		end
	end
	return out
end

return SceneScan
