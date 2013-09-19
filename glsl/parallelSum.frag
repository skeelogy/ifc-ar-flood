//Fragment shader for performing parallel sum reduction
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uTexelSize;
uniform float uHalfTexelSize;
uniform vec4 uChannelId;

varying vec2 vUv;

void main() {

    //read original texture
    vec4 t = texture2D(uTexture, vUv);

    //expand the UVs and then read data from neighbours
    //do dot product with uChannelId vector to mask out only the channel value needed
    float oneMinusHalfTexelSize = 1.0 - uHalfTexelSize;
    vec2 expandedUv = vec2(
        (vUv.x - uHalfTexelSize) * 2.0 + uHalfTexelSize,
        (vUv.y - oneMinusHalfTexelSize) * 2.0 + oneMinusHalfTexelSize
    );
    float v1 = dot(texture2D(uTexture, expandedUv), uChannelId);
    float v2 = dot(texture2D(uTexture, expandedUv + vec2(uTexelSize, 0.0)), uChannelId);
    float v3 = dot(texture2D(uTexture, expandedUv + vec2(uTexelSize, -uTexelSize)), uChannelId);
    float v4 = dot(texture2D(uTexture, expandedUv + vec2(0.0, -uTexelSize)), uChannelId);

    //sum of values
    float final = v1 + v2 + v3 + v4;

    gl_FragColor = (vec4(1.0) - uChannelId) * t + uChannelId * final;
}