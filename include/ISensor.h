template <typename T>
class ISensor {
public:
    virtual void begin() = 0;
    virtual T read() = 0;

    virtual ~ISensor() = default;
};