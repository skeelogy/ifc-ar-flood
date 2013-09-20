//Fragment shader for performing parallel sum reduction
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uTexelSize;
uniform float uHalfTexelSize;
uniform vec4 uChannelMask;

varying vec2 vUv;

void main() {

    //read original texture
    vec4 t = texture2D(uTexture, vUv);

    //expand the UVs and then read data from neighbours
    //do dot product with uChannelMask vector to mask out only the channel value needed
    float oneMinusHalfTexelSize = 1.0 - uHalfTexelSize;
    vec2 expandedUv = vec2(
        (vUv.x - uHalfTexelSize) * 2.0 + uHalfTexelSize,
        (vUv.y - oneMinusHalfTexelSize) * 2.0 + oneMinusHalfTexelSize
    );
    float v1 = dot(texture2D(uTexture, expandedUv), uChannelMask);
    float v2 = dot(texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)), uChannelMask);
    float v3 = dot(texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)), uChannelMask);
    float v4 = dot(texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)), uChannelMask);

    //sum of values
    float final = v1 + v2 + v3 + v4;

    gl_FragColor = (vec4(1.0) - uChannelMask) * t + uChannelMask * final;
}