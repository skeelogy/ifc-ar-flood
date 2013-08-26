//GPU version of X Water
//author: Skeel Lee <skeel@skeelogy.com>

//NOTE: I have added in mean height in the calculations, purely because of the flooding system.
//It is not necessary if you do not need to rise the water level.

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uDampingFactor;
uniform float uMeanHeight;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: field1
    //b channel: field2
    //a channel: prev mean height

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //remove previous mean height first to bring back to 0 height
    t.r -= t.a;

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    t.b = 0.5 * (texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r - 4.0 * t.a) - t.b;
    t.b *= uDampingFactor;

    //update
    t.r = t.b;

    //add new mean height
    t.r += uMeanHeight;

    //store new mean height
    t.a = uMeanHeight;

    //swap buffers
    float temp = t.g;
    t.g = t.b;
    t.b = temp;

    //write out to texture for next step
    gl_FragColor = t;
}