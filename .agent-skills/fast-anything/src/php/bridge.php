final class /*CLASS*/
{
    // Calls the verified Rust port of /*ID*/ through PHP's FFI extension (extension=ffi in php.ini).
    // FAST_ANYTHING_DISABLE=1, or no FFI, runs the PHP version instead.
    public static ?bool $on = null;
    private static $ffi = null;
    private static array $params = [];

    public static function load(): bool
    {
        self::$on = false;
        if (getenv('FAST_ANYTHING_DISABLE') !== false || !extension_loaded('ffi')) return false;
        try {
            self::$ffi = \FFI::cdef('uint8_t *fa_call(const char *input, size_t len, size_t *out_len); void fa_free(uint8_t *ptr, size_t len);', __DIR__ . '/' . /*LIB*/);
        } catch (\Throwable $e) {
            return false;
        }
        return self::$on = true;
    }

    public static function call(string $name, array $args)
    {
        $ps = self::$params[$name] ??= (str_contains($name, '::') ? new \ReflectionMethod(...explode('::', $name, 2)) : new \ReflectionFunction($name))->getParameters();
        for ($i = count($args); $i < count($ps) && $ps[$i]->isDefaultValueAvailable(); $i++) $args[] = $ps[$i]->getDefaultValue();
        $in = json_encode($args, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $len = self::$ffi->new('size_t');
        $out = self::$ffi->fa_call($in, strlen($in), \FFI::addr($len));
        $n = $len->cdata;
        $text = \FFI::string($out, $n);
        self::$ffi->fa_free($out, $n);
        $reply = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        if (array_key_exists('error', $reply)) throw new \RuntimeException('fast-anything: ' . $reply['error']);
        return $reply['ok'];
    }
}