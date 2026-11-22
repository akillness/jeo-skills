--!strict
-- ReplicatedFirst runs before the rest of the game has loaded: keep it self-contained (no requires
-- outside ReplicatedFirst). The loading screen goes here; call
-- ReplicatedFirst:RemoveDefaultLoadingScreen() once your own screen shows.
script:SetAttribute("RanAt", os.clock())
script:SetAttribute("GameLoaded", game:IsLoaded())
