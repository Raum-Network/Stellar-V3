export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        if (typeof global !== 'undefined') {
            // Force js-sha256 to stay in pure-JS mode on the server.
            // This avoids crypto/buffer stubs from client-targeted bundles.
            // @ts-expect-error - runtime flag for js-sha256
            global.JS_SHA256_NO_NODE_JS = true;
            // @ts-expect-error - runtime flag for js-sha256
            global.JS_SHA256_NO_BUFFER_FROM = true;
        }

        const { Buffer } = await import('buffer');
        if (typeof global !== 'undefined' && !global.Buffer) {
            global.Buffer = Buffer;
        }
    }
}
