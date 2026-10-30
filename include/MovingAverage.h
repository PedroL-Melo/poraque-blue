#pragma once

#include <stddef.h>

/**
 * @brief Filtro de Média Móvel com buffer circular estático e atualização O(1).
 *
 * @tparam N Tamanho da janela do buffer circular (padrão: 30 amostras).
 * @tparam T Tipo numérico das amostras (padrão: float).
 */
template <size_t N = 30, typename T = float>
class MovingAverage {
    static_assert(N > 0, "O tamanho do buffer circular (N) deve ser maior que zero.");

public:
    constexpr MovingAverage() = default;

    /**
     * @brief Insere uma nova leitura no buffer circular em tempo constante O(1)
     *        e retorna a média móvel atualizada.
     *
     * @param newReading Nova amostra lida do sensor.
     * @return T Média móvel atualizada.
     */
    T update(T newReading) {
        sum_ = sum_ - buffer_[index_] + newReading;
        buffer_[index_] = newReading;
        index_ = (index_ + 1) % N;

        if (count_ < N) {
            count_++;
        }

        return getAverage();
    }

    /**
     * @brief Retorna a média móvel atual em O(1).
     */
    T getAverage() const {
        return (count_ > 0) ? (sum_ / static_cast<T>(count_)) : static_cast<T>(0);
    }

    /**
     * @brief Reinicia o estado interno do filtro e zera o buffer circular.
     */
    void reset() {
        for (size_t i = 0; i < N; ++i) {
            buffer_[i] = static_cast<T>(0);
        }
        sum_   = static_cast<T>(0);
        index_ = 0;
        count_ = 0;
    }

    /**
     * @brief Retorna a quantidade de amostras válidas atualmente armazenadas (até N).
     */
    size_t getCount() const {
        return count_;
    }

    /**
     * @brief Retorna a capacidade total configurada da janela (N).
     */
    constexpr size_t getCapacity() const {
        return N;
    }

private:
    T buffer_[N]  = {};
    T sum_        = static_cast<T>(0);
    size_t index_ = 0;
    size_t count_ = 0;
};

