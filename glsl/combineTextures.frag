//Fragment shader to combine textures
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;

varying vec2 vUv;

void main() {
    gl_FragColor = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);
}