//GPU version of X Water
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform int uIsDisturbing;
uniform float uDisturbAmount;
uniform float uDisturbRadius;
uniform vec2 uDisturbPos;
uniform float uDampingFactor;

varying vec2 vUv;

float getDisturbHeight(vec2 uv) {
    float disturb = 0.0;
    if (uIsDisturbing == 1) {
        float len = length(uv - vec2(uDisturbPos.x, 1.0 - uDisturbPos.y));
        disturb = uDisturbAmount * (1.0 - smoothstep(0.0, uDisturbRadius, len));
    }
    return disturb;
}

void main() {

    //NOTE: There are actually multiple steps below, each of which needs synchronization.
    //However, since we are recalculating the disturb height over and over for each neighbour,
    //and that we are reading the old texture for previous frame data (i.e. neighbour data remains the same),
    //the steps below gives the intended results without synchronization.
    //Should test whether multiple render passes is faster or not.

    //r channel: height
    //g channel: field1
    //b channel: field2

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //add disturb
    t.g += getDisturbHeight(vUv);

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    t.b = 0.5 * (texture2D(uTexture,vUv+du).g + getDisturbHeight(vUv+du)
                   + texture2D(uTexture,vUv-du).g + getDisturbHeight(vUv-du)
                   + texture2D(uTexture,vUv+dv).g + getDisturbHeight(vUv+dv)
                   + texture2D(uTexture,vUv-dv).g + getDisturbHeight(vUv-dv)) - t.b;
    t.b *= uDampingFactor;

    //update
    t.r = t.b;

    //swap buffers
    float temp = t.g;
    t.g = t.b;
    t.b = temp;

    //write out to texture for next step
    gl_FragColor = vec4(t.rgb, 1.0);
}