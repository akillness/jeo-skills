--!nonstrict
-- UIKit: build UI as real instances (Edit data model, inspectable by an agent and a designer).
-- Inlined by rbx_ui.run(kit={"UIKit"}); also usable as a ModuleScript.
--
--   UIKit.new("Frame", { Name = "Panel", Size = UDim2.fromScale(0.5, 0.5), Tags = { "Card" } }, { child })
--   UIKit.replace(parent, inst)       destroy the previous instance of the same name, parent the new one
--   UIKit.rect(gui)                   { x, y, w, h } from AbsolutePosition and AbsoluteSize
--
-- Leave a property out of `props` when a StyleSheet should own it: a property set on the instance
-- overrides every StyleRule for that property (observed, Studio 0.743).

local UIKit = {}

function UIKit.new(className: string, props: { [string]: any }?, children: { Instance }?)
	local inst = Instance.new(className)
	local parent = nil
	local p: { [string]: any } = props or {}
	local kids: { Instance } = children or {}
	for k, v in p do
		if k == "Parent" then
			parent = v
		elseif k == "Tags" then
			for _, t in v do
				inst:AddTag(t)
			end
		elseif k == "Attributes" then
			for a, x in v do
				inst:SetAttribute(a, x)
			end
		else
			(inst :: any)[k] = v
		end
	end
	for _, c in kids do
		c.Parent = inst
	end
	if parent then
		inst.Parent = parent -- parent last: one replication and layout pass
	end
	return inst
end

function UIKit.replace(parent: Instance, inst: Instance): Instance
	local old = parent:FindFirstChild(inst.Name)
	if old then
		old:Destroy()
	end
	inst.Parent = parent
	return inst
end

function UIKit.rect(gui: GuiBase2d)
	local p, s = gui.AbsolutePosition, gui.AbsoluteSize
	return { x = p.X, y = p.Y, w = s.X, h = s.Y }
end

-- Buttons share one constructor so every one is Selectable (gamepad) and AutoLocalize stays explicit.
function UIKit.button(name: string, text: string, props: { [string]: any }?)
	local p: { [string]: any } = { Name = name, Text = text, AutoButtonColor = true, Selectable = true }
	local extra: { [string]: any } = props or {}
	for k, v in extra do
		p[k] = v
	end
	return UIKit.new("TextButton", p)
end

return UIKit
