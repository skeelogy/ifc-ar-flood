//Fragment shader for performing parallel sum reduction
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uTexelSize;
uniform float uHalfTexelSize;

varying vec2 vUv;

void main() {

    float oneMinusHalfTexelSize = 1.0 - uHalfTexelSize;

    vec2 expandedUv = vec2(
        (vUv.x - uHalfTexelSize) * 2.0 + uHalfTexelSize,
        (vUv.y - oneMinusHalfTexelSize) * 2.0 + oneMinusHalfTexelSize
    );

    vec4 t = texture2D(uTexture, vUv);

    float v1 = texture2D(uTexture, expandedUv).r;
    float v2 = texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)).r;
    float v3 = texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)).r;
    float v4 = texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)).r;

    float final = v1 + v2 + v3 + v4;

    gl_FragColor = vec4(final, t.gba);
}