//GPU version of X Water
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uDampingFactor;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: field1
    //b channel: field2

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    t.b = 0.5 * (texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r) - t.b;
    t.b *= uDampingFactor;

    //update
    t.r = t.b;

    //swap buffers
    float temp = t.g;
    t.g = t.b;
    t.b = temp;

    //write out to texture for next step
    gl_FragColor = t;
}