//Fragment shader that sets alpha for the given texture to 1.0
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;

varying vec2 vUv;

void main() {
    gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, 1.0);
}