//GPU version of HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uDampingFactor;

varying vec2 vUv;

void main() {

    //r channel: height
    //g channel: vertDeriv

    //read texture from previous step
    vec4 t = texture2D(uTexture, vUv);

    //propagate
    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);
    t.g += 0.25 * (texture2D(uTexture,vUv+du).r
                   + texture2D(uTexture,vUv-du).r
                   + texture2D(uTexture,vUv+dv).r
                   + texture2D(uTexture,vUv-dv).r) - t.r;
    t.g *= uDampingFactor;

    //update
    t.r += t.g;

    //write out to texture for next step
    gl_FragColor = vec4(t.rgb, 1.0);
}