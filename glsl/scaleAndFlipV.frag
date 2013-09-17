//Fragment shader to scale and flip a texture
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uScale;

varying vec2 vUv;

void main() {
    vec2 scaledAndFlippedUv = vec2(vUv.x * uScale, 1.0 - (vUv.y * uScale));
    gl_FragColor = texture2D(uTexture, scaledAndFlippedUv);
}