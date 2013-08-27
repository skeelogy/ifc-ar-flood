//Fragment shader for adding a small bump
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform float uBumpAmount;
uniform float uBumpRadius;
uniform vec2 uBumpPos;

varying vec2 vUv;

void main() {

    //r channel: height

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //add bump
    float len = length(vUv - vec2(uBumpPos.x, 1.0 - uBumpPos.y));
    t.r += uBumpAmount * smoothstep(uBumpRadius, 0.0, len);

    //write out to texture for next step
    gl_FragColor = t;
}