do
	local function _jsn_escape(s)
		return (s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t'))
	end

	local function _jsn_ser(val)
		local t = type(val)
		if t == "nil" then
			return "null"
		elseif t == "boolean" then
			return tostring(val)
		elseif t == "number" then
			if val ~= val or val == math.huge or val == -math.huge then return "null" end
			if math.floor(val) == val and val > -1e15 and val < 1e15 then
				return string.format("%d", val)
			end
			return tostring(val)
		elseif t == "string" then
			return '"' .. _jsn_escape(val) .. '"'
		elseif t == "table" then
			local n = #val
			local isArr = n > 0 or next(val) == nil
			if isArr and n > 0 then
				for k in pairs(val) do
					if type(k) ~= "number" or math.floor(k) ~= k or k < 1 or k > n then
						isArr = false
						break
					end
				end
			end
			local parts = {}
			if isArr then
				for i = 1, n do
					parts[i] = _jsn_ser(val[i])
				end
				return "[" .. table.concat(parts, ",") .. "]"
			else
				local i = 0
				for k, v in pairs(val) do
					if type(k) == "string" then
						i = i + 1
						parts[i] = '"' .. _jsn_escape(k) .. '":' .. _jsn_ser(v)
					end
				end
				return "{" .. table.concat(parts, ",") .. "}"
			end
		end
		return "null"
	end

	local function _jsn_skip(s, i)
		while i <= #s do
			local b = s:byte(i)
			if b ~= 32 and b ~= 9 and b ~= 10 and b ~= 13 then break end
			i = i + 1
		end
		return i
	end

	local function _jsn_str(s, i)
		i = i + 1
		local buf, n = {}, 0
		while i <= #s do
			local c = s:sub(i, i)
			if c == '"' then
				return table.concat(buf, "", 1, n), i + 1
			elseif c == '\\' then
				local nx = s:sub(i + 1, i + 1)
				n = n + 1
				if     nx == '"'  then buf[n] = '"'
				elseif nx == '\\' then buf[n] = '\\'
				elseif nx == '/'  then buf[n] = '/'
				elseif nx == 'n'  then buf[n] = '\n'
				elseif nx == 'r'  then buf[n] = '\r'
				elseif nx == 't'  then buf[n] = '\t'
				elseif nx == 'b'  then buf[n] = '\8'
				elseif nx == 'f'  then buf[n] = '\12'
				else               buf[n] = nx
				end
				i = i + 2
			else
				n = n + 1; buf[n] = c; i = i + 1
			end
		end
		error("JSON: unterminated string")
	end

	local function _jsn_num(s, i)
		local e = i
		if s:sub(e, e) == '-' then e = e + 1 end
		while e <= #s and s:sub(e, e):match('%d') do e = e + 1 end
		if e <= #s and s:sub(e, e) == '.' then
			e = e + 1
			while e <= #s and s:sub(e, e):match('%d') do e = e + 1 end
		end
		if e <= #s and s:sub(e, e):match('[eE]') then
			e = e + 1
			if e <= #s and s:sub(e, e):match('[+-]') then e = e + 1 end
			while e <= #s and s:sub(e, e):match('%d') do e = e + 1 end
		end
		return tonumber(s:sub(i, e - 1)), e
	end

	local _jsn_val
	_jsn_val = function(s, i)
		i = _jsn_skip(s, i)
		local c = s:sub(i, i)
		if c == '"' then
			return _jsn_str(s, i)
		elseif c == '{' then
			local obj = {}
			i = _jsn_skip(s, i + 1)
			if s:sub(i, i) == '}' then return obj, i + 1 end
			while true do
				i = _jsn_skip(s, i)
				local k; k, i = _jsn_str(s, i)
				i = _jsn_skip(s, i)
				i = i + 1
				local v; v, i = _jsn_val(s, i)
				obj[k] = v
				i = _jsn_skip(s, i)
				c = s:sub(i, i)
				if c == '}' then return obj, i + 1 end
				i = i + 1
			end
		elseif c == '[' then
			local arr = {}
			i = _jsn_skip(s, i + 1)
			if s:sub(i, i) == ']' then return arr, i + 1 end
			while true do
				local v; v, i = _jsn_val(s, i)
				arr[#arr + 1] = v
				i = _jsn_skip(s, i)
				c = s:sub(i, i)
				if c == ']' then return arr, i + 1 end
				i = i + 1
			end
		elseif c == 't' then return true, i + 4
		elseif c == 'f' then return false, i + 5
		elseif c == 'n' then return nil, i + 4
		else return _jsn_num(s, i)
		end
	end

	_G["JSON"] = {
		stringify = _jsn_ser,
		parse = function(s) return (_jsn_val(s, 1)) end
	}
end