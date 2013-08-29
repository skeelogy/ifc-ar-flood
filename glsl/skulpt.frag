//Fragment shader for sculpting
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uBaseTexture;
uniform sampler2D uSculptTexture1;
uniform vec2 uTexelSize;
uniform int uIsSculpting;
uniform int uSculptType;
uniform float uSculptAmount;
uniform float uSculptRadius;
uniform vec2 uSculptPos;

varying vec2 vUv;

float add(vec2 uv) {
    float len = length(uv - vec2(uSculptPos.x, 1.0 - uSculptPos.y));
    return uSculptAmount * smoothstep(uSculptRadius, 0.0, len);
}

void main() {

    //r channel: height

    //read base texture
    vec4 tBase = texture2D(uBaseTexture, vUv);

    //read texture from previous step
    vec4 t1 = texture2D(uSculptTexture1, vUv);

    //add sculpt
    if (uIsSculpting == 1) {
        if (uSculptType == 1) {  //add
            t1.r += add(vUv);
        } else if (uSculptType == 2) {  //remove
            t1.r -= add(vUv);
            t1.r = max(0.0, tBase.r + t1.r) - tBase.r;
        }
    }

    //write out to texture for next step
    gl_FragColor = t1;
}