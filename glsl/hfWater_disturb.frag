//GPU disturb water pass
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform int uIsDisturbing;
uniform float uDisturbAmount;
uniform float uDisturbRadius;
uniform vec2 uDisturbPos;

varying vec2 vUv;

void main() {

    //r channel: height

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //add disturb
    if (uIsDisturbing == 1) {
        float len = length(vUv - vec2(uDisturbPos.x, 1.0 - uDisturbPos.y));
        t.r += uDisturbAmount * (1.0 - smoothstep(0.0, uDisturbRadius, len));
    }

    //write out to texture for next step
    gl_FragColor = vec4(t.rgb, 1.0);
}