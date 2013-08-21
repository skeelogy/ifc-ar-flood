//Fragment shader to combine a texture and a float
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uOffset;

varying vec2 vUv;

void main() {
    gl_FragColor = texture2D(uTexture, vUv) + vec4(uOffset);
}