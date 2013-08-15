//a very basic shader that renders out the Y height data into a texture
//author: Skeel Lee <skeel@skeelogy.com>

varying vec3 vPosition;

void main() {
    gl_FragColor = vec4(vPosition.y, 0.0, 0.0, 1.0);
}