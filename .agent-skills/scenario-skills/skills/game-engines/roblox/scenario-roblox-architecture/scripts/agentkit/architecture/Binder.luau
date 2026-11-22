--!strict
-- Binder: one module gives every instance carrying a tag its behavior, and cleans it up.
--
--   local unbind = Binder.bind("Sword", function(tool)
--       return tool.Activated:Connect(onSwing)       -- the cleanup (see Binder.clean)
--   end, { ancestors = { workspace, game:GetService("Players") } })
--
-- Binds only instances under `ancestors` (default { workspace }): a tagged template in
-- ServerStorage or ReplicatedStorage is a descendant of the DataModel too and GetTagged returns it.
-- Unbinds when the tag is removed, when the instance leaves the ancestors (reparent, Destroy,
-- streaming out) and when the returned function is called. Re-binds when it comes back.
-- Moving an instance between two containers of the DataModel fires no InstanceAdded signal, so
-- each tagged instance is watched through AncestryChanged.

export type Options = { ancestors: { Instance }? }

local Binder = {}

-- Cleanup objects such as Trove or Janitor (Destroy) and custom connections (Disconnect).
type Destroyable = { Destroy: (self: any) -> () }
type Disconnectable = { Disconnect: (self: any) -> () }

-- xpcall message handler: passing debug.traceback directly fails the new type solver.
local function trace(err: any): string
	return debug.traceback(tostring(err), 2)
end

-- Runs a cleanup: function, RBXScriptConnection, Instance, thread, a table with Destroy or
-- Disconnect, or an array of these (cleaned last to first).
function Binder.clean(x: any)
	local t = typeof(x)
	if t == "function" then
		x()
	elseif t == "RBXScriptConnection" then
		x:Disconnect()
	elseif t == "Instance" then
		x:Destroy()
	elseif t == "thread" then
		task.cancel(x)
	elseif t == "table" then
		-- Typed views first: refining x.Destroy on an `any` leaves an uncallable `function` on the new solver.
		local destroyable = x :: Destroyable
		local disconnectable = x :: Disconnectable
		if type(destroyable.Destroy) == "function" then
			destroyable:Destroy()
		elseif type(disconnectable.Disconnect) == "function" then
			disconnectable:Disconnect()
		else
			for i = #x, 1, -1 do
				Binder.clean(x[i])
			end
		end
	end
end

function Binder.bind(tag: string, setup: (Instance) -> any, opts: Options?): () -> ()
	local CollectionService = game:GetService("CollectionService")
	local ancestors: { Instance } = (opts and opts.ancestors) or { workspace }
	local bound: { [Instance]: any } = {}
	local watching: { [Instance]: RBXScriptConnection } = {}
	local alive = true

	local function inScope(inst: Instance): boolean
		for _, a in ancestors do
			if inst:IsDescendantOf(a) then
				return true
			end
		end
		return false
	end

	local function release(inst: Instance)
		local c = bound[inst]
		if c == nil then
			return
		end
		bound[inst] = nil
		if c ~= true then
			local ok, err = pcall(function()
				Binder.clean(c)
			end)
			if not ok then
				warn(`[Binder] {tag} cleanup failed on {inst:GetFullName()}: {err}`)
			end
		end
	end

	local function evaluate(inst: Instance)
		if not alive then
			return
		end
		local want = inst:HasTag(tag) and inScope(inst)
		if want and bound[inst] == nil then
			bound[inst] = true -- placeholder: setup may yield or trigger evaluate again
			local ok, result = xpcall(setup, trace, inst)
			if not ok then
				warn(`[Binder] {tag} setup failed on {inst:GetFullName()}: {result}`)
				result = nil
			end
			if bound[inst] == true then
				bound[inst] = if result ~= nil then result else true
			elseif result ~= nil then
				Binder.clean(result) -- released while setup ran
			end
		elseif not want and bound[inst] ~= nil then
			release(inst)
		end
	end

	local function onAdded(inst: Instance)
		if not watching[inst] then
			watching[inst] = inst.AncestryChanged:Connect(function()
				evaluate(inst)
			end)
		end
		evaluate(inst)
	end

	local function onRemoved(inst: Instance)
		local w = watching[inst]
		if w then
			w:Disconnect()
			watching[inst] = nil
		end
		release(inst)
	end

	-- Connect first, then read the current set: nothing tagged in between is missed.
	local added = CollectionService:GetInstanceAddedSignal(tag):Connect(onAdded)
	local removed = CollectionService:GetInstanceRemovedSignal(tag):Connect(onRemoved)
	for _, inst in CollectionService:GetTagged(tag) do
		onAdded(inst)
	end

	return function()
		alive = false
		added:Disconnect()
		removed:Disconnect()
		for _, w in watching do
			w:Disconnect()
		end
		table.clear(watching)
		local list = {}
		for inst in bound do
			table.insert(list, inst)
		end
		for _, inst in list do
			release(inst)
		end
	end
end

return Binder
