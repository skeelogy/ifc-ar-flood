//Fragment shader to calculate a water disturb map based on displaced heights from this frame and prev frame
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform vec2 uTexelSize;

varying vec2 vUv;

void main() {

    vec2 du = vec2(uTexelSize.r, 0.0);
    vec2 dv = vec2(0.0, uTexelSize.g);

    //read textures
    //r channel: whether in obstacle or not (accumulated)
    //g channel: height of water displaced (accumulated)
    //b channel: height of water displaced from previous step (accumulated)
    //a channel: height of water displaced (only for current rendered object)
    vec4 tLeft = texture2D(uTexture, vUv-du);
    vec4 tRight = texture2D(uTexture, vUv+du);
    vec4 tTop = texture2D(uTexture, vUv+dv);
    vec4 tBottom = texture2D(uTexture, vUv-dv);

    //receive a quarter of displaced volume differences from neighbours
    float result = 0.25 * ( (tLeft.g-tLeft.b) + (tRight.g-tRight.b) + (tTop.g-tTop.b) + (tBottom.g-tBottom.b) );

    gl_FragColor = vec4(result, -result, 0.0, 1.0);  //g channel is there just to visualize negative displaced volumes
}