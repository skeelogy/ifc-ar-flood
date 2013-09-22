//Fragment shader to calculate static obstacles texture
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uObstacleTopTexture;
uniform float uHalfRange;

varying vec2 vUv;

void main() {

    //read texture for obstacle
    //r, g, b channels: depth (all these channels contain same value)
    //a channel: alpha
    vec4 tTop = texture2D(uObstacleTopTexture, vUv);

    //convert top value to world height
    float topHeight = (uHalfRange - tTop.r) * tTop.a;

    //write out to texture for next step
    gl_FragColor = vec4(topHeight, 0.0, 0.0, 1.0);
}