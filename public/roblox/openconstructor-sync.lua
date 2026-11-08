--[[
  openconstructor sync — Roblox Studio plugin
  https://openconstructor.pw · MIT license · source: https://github.com/Kuloka/openconstructor

  Pulls an interface you built on openconstructor.pw straight into StarterGui.

  Install: Studio → Plugins tab → Plugins Folder → put this file there → restart Studio.
  Use:     on openconstructor.pw open Export → "Sync to Roblox Studio", copy the code,
           then in Studio click "Sync UI" on the openconstructor toolbar, paste the code and press Sync.
           "Live" re-syncs by itself whenever you press Sync again on the website.

  Your button logic is safe: if you edited the generated "Buttons" LocalScript,
  re-syncing keeps your version instead of overwriting it.
]]

local HttpService = game:GetService("HttpService")
local StarterGui = game:GetService("StarterGui")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")

local API = "https://openconstructor.pw/api/sync/"
local LIVE_EVERY = 4        -- seconds between checks in live mode
local LIVE_FOR = 20 * 60    -- live mode switches itself off after 20 minutes

------------------------------------------------------------------ decoding
local function enumItem(enumName, value)
	local ok, enum = pcall(function() return Enum[enumName] end)
	if ok and enum then
		for _, item in ipairs(enum:GetEnumItems()) do
			if item.Value == value then return item end
		end
	end
	return value
end

local function decode(prop, t, v)
	if t == "string" or t == "bool" or t == "int" or t == "float" or t == "ProtectedString" then return v end
	if t == "token" then return enumItem(prop, v) end
	if t == "Color3" then return Color3.new(v[1], v[2], v[3]) end
	if t == "UDim2" then return UDim2.new(v[1], v[2], v[3], v[4]) end
	if t == "UDim" then return UDim.new(v[1], v[2]) end
	if t == "Vector2" then return Vector2.new(v[1], v[2]) end
	if t == "Font" then
		return Font.new(v[1], (v[2] or 400) >= 600 and Enum.FontWeight.Bold or Enum.FontWeight.Regular, Enum.FontStyle.Normal)
	end
	if t == "ColorSequence" then
		local kps = {}
		for i, k in ipairs(v) do kps[i] = ColorSequenceKeypoint.new(k[1], Color3.new(k[2], k[3], k[4])) end
		return ColorSequence.new(kps)
	end
	if t == "NumberSequence" then
		local kps = {}
		for i, k in ipairs(v) do kps[i] = NumberSequenceKeypoint.new(k[1], k[2]) end
		return NumberSequence.new(kps)
	end
	return nil
end

-- Build one instance (and its children) from { c = ClassName, p = { Prop = { type, value } }, k = { … } }
local skipped = 0
local function build(node, parent)
	local ok, inst = pcall(Instance.new, node.c)
	if not ok then skipped = skipped + 1 return nil end
	for prop, tv in pairs(node.p or {}) do
		if prop ~= "Parent" then
			local value = decode(prop, tv[1], tv[2])
			if value ~= nil then
				local set = pcall(function() inst[prop] = value end)
				if not set then skipped = skipped + 1 end
			end
		end
	end
	for _, child in ipairs(node.k or {}) do build(child, inst) end
	inst.Parent = parent
	return inst
end

------------------------------------------------------------------ network
local function fetch(code)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({ Url = API .. code, Method = "GET" })
	end)
	if not ok then
		return nil, "Couldn't reach openconstructor.pw. Allow HTTP requests for this plugin when Studio asks (or in Plugins → Manage Plugins). " .. tostring(res)
	end
	local body
	pcall(function() body = HttpService:JSONDecode(res.Body) end)
	if not res.Success then
		local msg = body and body.error and body.error.message or ("HTTP " .. tostring(res.StatusCode))
		return nil, msg
	end
	if not body or not body.spec or not body.spec.tree then return nil, "Unexpected answer from the server." end
	return body
end

------------------------------------------------------------------ apply
local function findExisting(code)
	for _, gui in ipairs(StarterGui:GetChildren()) do
		if gui:GetAttribute("ocSyncCode") == code then return gui end
	end
	return nil
end

local function apply(code, data)
	local spec = data.spec
	skipped = 0
	local recording
	pcall(function() recording = ChangeHistoryService:TryBeginRecording("openconstructor sync") end)

	local old = findExisting(code)
	local gui = build(spec.tree, nil)
	if not gui then return false, "Couldn't build the UI." end
	gui:SetAttribute("ocSyncCode", code)
	gui:SetAttribute("ocUpdated", tostring(data.updated))

	-- keep the user's edited button script
	local kept = false
	local lastGenerated = plugin:GetSetting("src_" .. code)
	if old then
		local oldScript = old:FindFirstChild("Buttons")
		local newScript = gui:FindFirstChild("Buttons")
		if oldScript and oldScript:IsA("LuaSourceContainer") and lastGenerated and oldScript.Source ~= lastGenerated and newScript then
			newScript:Destroy()
			oldScript.Parent = gui
			kept = true
		end
	end
	local generated = gui:FindFirstChild("Buttons")
	if generated and not kept then plugin:SetSetting("src_" .. code, generated.Source) end

	if old then old:Destroy() end
	gui.Parent = StarterGui

	if recording then
		pcall(function() ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end)
	else
		pcall(function() ChangeHistoryService:SetWaypoint("openconstructor sync") end)
	end
	local note = kept and " Your edited Buttons script was kept." or ""
	if skipped > 0 then note = note .. (" (" .. skipped .. " properties skipped)") end
	return true, "Synced “" .. tostring(spec.title) .. "” into StarterGui." .. note, gui
end

------------------------------------------------------------------ widget
local toolbar = plugin:CreateToolbar("openconstructor")
local openButton = toolbar:CreateButton("Sync UI", "Pull your interface from openconstructor.pw", "rbxasset://textures/ui/GuiImagePlaceholder.png")
openButton.ClickableWhenViewportHidden = true

local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 340, 230, 300, 200)
local widget = plugin:CreateDockWidgetPluginGui("openconstructorSync", info)
widget.Title = "openconstructor sync"

local ACCENT = Color3.fromRGB(232, 135, 92)
local BG = Color3.fromRGB(18, 16, 16)
local FG = Color3.fromRGB(236, 230, 228)
local MUTED = Color3.fromRGB(148, 136, 132)

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = BG
root.BorderSizePixel = 0
root.Parent = widget
local pad = Instance.new("UIPadding")
pad.PaddingTop, pad.PaddingBottom, pad.PaddingLeft, pad.PaddingRight = UDim.new(0, 12), UDim.new(0, 12), UDim.new(0, 12), UDim.new(0, 12)
pad.Parent = root
local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 8)
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = root

local function label(text, order, color, size)
	local l = Instance.new("TextLabel")
	l.LayoutOrder = order
	l.Size = UDim2.new(1, 0, 0, size or 16)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.Gotham
	l.TextSize = 13
	l.TextColor3 = color or MUTED
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.Text = text
	l.Parent = root
	return l
end
local function corner(o) local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, 6) c.Parent = o end

label("Sync code from openconstructor.pw → Export → Sync to Roblox Studio", 1, MUTED, 30)

local codeBox = Instance.new("TextBox")
codeBox.LayoutOrder = 2
codeBox.Size = UDim2.new(1, 0, 0, 30)
codeBox.BackgroundColor3 = Color3.fromRGB(30, 26, 25)
codeBox.TextColor3 = FG
codeBox.PlaceholderText = "paste the 12-letter code"
codeBox.PlaceholderColor3 = MUTED
codeBox.Font = Enum.Font.Code
codeBox.TextSize = 15
codeBox.ClearTextOnFocus = false
codeBox.Text = plugin:GetSetting("lastCode") or ""
codeBox.Parent = root
corner(codeBox)

local row = Instance.new("Frame")
row.LayoutOrder = 3
row.Size = UDim2.new(1, 0, 0, 30)
row.BackgroundTransparency = 1
row.Parent = root
local rowList = Instance.new("UIListLayout")
rowList.FillDirection = Enum.FillDirection.Horizontal
rowList.Padding = UDim.new(0, 8)
rowList.Parent = row

local function button(text, width, primary)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(width, -4, 1, 0)
	b.BackgroundColor3 = primary and ACCENT or Color3.fromRGB(38, 33, 32)
	b.TextColor3 = primary and Color3.new(1, 1, 1) or FG
	b.Font = Enum.Font.GothamBold
	b.TextSize = 13
	b.Text = text
	b.AutoButtonColor = true
	b.Parent = row
	corner(b)
	return b
end
local syncButton = button("Sync", 0.5, true)
local liveButton = button("Live: off", 0.5, false)

local status = label("", 4, MUTED, 60)

------------------------------------------------------------------ actions
local live, liveSince, lastUpdated = false, 0, nil

local function cleanCode()
	local code = string.lower((codeBox.Text:gsub("%s+", "")))
	codeBox.Text = code
	return code
end

local function syncNow(quiet)
	local code = cleanCode()
	if not string.match(code, "^[a-z2-7]+$") or #code ~= 12 then
		status.TextColor3 = ACCENT
		status.Text = "The code is 12 letters and digits — copy it from openconstructor.pw → Export → Sync to Roblox Studio."
		return false
	end
	plugin:SetSetting("lastCode", code)
	if not quiet then status.TextColor3 = MUTED status.Text = "Syncing…" end
	local data, err = fetch(code)
	if not data then
		status.TextColor3 = ACCENT
		status.Text = err
		return false
	end
	if quiet and data.updated == lastUpdated then return true end
	local ok, msg, gui = apply(code, data)
	lastUpdated = data.updated
	status.TextColor3 = ok and FG or ACCENT
	status.Text = msg .. (live and "  · live" or "")
	if ok and gui and not quiet then Selection:Set({ gui }) end
	return ok
end

local function setLive(on)
	live = on
	liveSince = os.clock()
	liveButton.Text = on and "Live: on" or "Live: off"
	liveButton.BackgroundColor3 = on and Color3.fromRGB(60, 34, 26) or Color3.fromRGB(38, 33, 32)
	if on then
		if syncNow(false) == false then live = false liveButton.Text = "Live: off" return end
		task.spawn(function()
			while live do
				task.wait(LIVE_EVERY)
				if not live then break end
				if os.clock() - liveSince > LIVE_FOR then
					setLive(false)
					status.Text = status.Text .. "\nLive mode stopped after 20 minutes — press Live to resume."
					break
				end
				if widget.Enabled then syncNow(true) end
			end
		end)
	end
end

syncButton.MouseButton1Click:Connect(function() syncNow(false) end)
liveButton.MouseButton1Click:Connect(function() setLive(not live) end)
codeBox.FocusLost:Connect(function(enter) if enter then syncNow(false) end end)
openButton.Click:Connect(function() widget.Enabled = not widget.Enabled end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function() openButton:SetActive(widget.Enabled) end)
plugin.Unloading:Connect(function() live = false end)
