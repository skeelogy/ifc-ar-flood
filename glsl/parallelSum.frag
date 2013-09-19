//Fragment shader for performing parallel sum reduction
//author: Skeel Lee <skeel@skeelogy.com>

//TODO: find out if there's a way to avoid the if-statements below

uniform sampler2D uTexture;
uniform float uTexelSize;
uniform float uHalfTexelSize;
uniform int uChannelId;

varying vec2 vUv;

void main() {

    float oneMinusHalfTexelSize = 1.0 - uHalfTexelSize;

    vec2 expandedUv = vec2(
        (vUv.x - uHalfTexelSize) * 2.0 + uHalfTexelSize,
        (vUv.y - oneMinusHalfTexelSize) * 2.0 + oneMinusHalfTexelSize
    );

    vec4 t = texture2D(uTexture, vUv);

    float v1, v2, v3, v4;
    if (uChannelId == 0) {
        v1 = texture2D(uTexture, expandedUv).r;
        v2 = texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)).r;
        v3 = texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)).r;
        v4 = texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)).r;
    } else if (uChannelId == 1) {
        v1 = texture2D(uTexture, expandedUv).g;
        v2 = texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)).g;
        v3 = texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)).g;
        v4 = texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)).g;
    } else if (uChannelId == 2) {
        v1 = texture2D(uTexture, expandedUv).b;
        v2 = texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)).b;
        v3 = texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)).b;
        v4 = texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)).b;
    } else {
        v1 = texture2D(uTexture, expandedUv).a;
        v2 = texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)).a;
        v3 = texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)).a;
        v4 = texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)).a;
    }

    float final = v1 + v2 + v3 + v4;

    if (uChannelId == 0) {
        gl_FragColor = vec4(final, t.g, t.b, t.a);
    } else if (uChannelId == 1) {
        gl_FragColor = vec4(t.r, final, t.b, t.a);
    } else if (uChannelId == 2) {
        gl_FragColor = vec4(t.r, t.g, final, t.a);
    } else {
        gl_FragColor = vec4(t.r, t.g, t.b, final);
    }
}