//Fragment shader to set colors on specific channels while keeping the rest of the channels intact
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec4 uColor;
uniform vec4 uChannelMask;

varying vec2 vUv;

void main() {
    vec4 t = texture2D(uTexture, vUv);
    gl_FragColor = (vec4(1.0) - uChannelMask) * t + uChannelMask * uColor;
}