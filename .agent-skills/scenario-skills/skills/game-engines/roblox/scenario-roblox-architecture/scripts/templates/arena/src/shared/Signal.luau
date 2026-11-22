--!strict
-- Signal: in-process event between modules on one side (never crosses the network).
-- Handlers run in their own thread, so a yielding or failing handler cannot stall the firer.
-- For team projects, a maintained package (sleitnick/signal on Wally) does the same job.

export type Connection = { Connected: boolean, Disconnect: (self: Connection) -> () }
export type Signal<T...> = {
	Connect: (self: Signal<T...>, fn: (T...) -> ()) -> Connection,
	Once: (self: Signal<T...>, fn: (T...) -> ()) -> Connection,
	Fire: (self: Signal<T...>, T...) -> (),
	DisconnectAll: (self: Signal<T...>) -> (),
}

type Handler = { Connected: boolean, fn: (...any) -> (), Disconnect: (self: Handler) -> () }

local Signal = {}
Signal.__index = Signal

function Signal.new<T...>(): Signal<T...>
	local handlers: { Handler } = {}
	return setmetatable({ _handlers = handlers }, Signal) :: any
end

function Signal.Connect(self: any, fn: (...any) -> ()): Connection
	local handlers: { Handler } = self._handlers
	local conn: Handler
	conn = {
		Connected = true,
		fn = fn,
		Disconnect = function(c: Handler)
			if not c.Connected then
				return
			end
			c.Connected = false
			local i = table.find(handlers, c)
			if i then
				table.remove(handlers, i)
			end
		end,
	}
	table.insert(handlers, conn)
	return conn :: any
end

function Signal.Once(self: any, fn: (...any) -> ()): Connection
	local conn: Connection
	conn = Signal.Connect(self, function(...)
		conn:Disconnect()
		fn(...)
	end)
	return conn
end

function Signal.Fire(self: any, ...: any)
	local handlers: { Handler } = self._handlers
	for _, conn in table.clone(handlers) do
		if conn.Connected then
			task.spawn(conn.fn, ...)
		end
	end
end

function Signal.DisconnectAll(self: any)
	local handlers: { Handler } = self._handlers
	for _, conn in table.clone(handlers) do
		conn:Disconnect()
	end
end

return Signal
